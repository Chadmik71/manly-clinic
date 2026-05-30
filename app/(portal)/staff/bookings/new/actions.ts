"use server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { addMinutes } from "date-fns";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { bookingReference } from "@/lib/utils";
import {
  BOOKING_LATEST_END_MIN,
  BOOKING_EARLIEST_START_MIN,
} from "@/lib/clinic";
import { revalidatePath } from "next/cache";
import { sydneyDateOf, sydneyDow, sydneyLocalToUtc } from "@/lib/time";

// Sydney minute-of-day for the given UTC instant. Vercel runs UTC but the
// clinic operates on Sydney calendar time, so raw getHours/getMinutes are
// off by 10-11 hours and would reject valid bookings (or accept invalid ones).
const SYD_HM_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function sydneyMinuteOfDay(d: Date): number {
  const parts = SYD_HM_FMT.formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

const schema = z.object({
  mode: z.enum(["existing", "walkin"]),
  clientId: z.string().optional(),
  walkInName: z.string().max(120).optional(),
  walkInPhone: z.string().max(40).optional(),
  walkInEmail: z.string().email().max(200).optional().or(z.literal("")),
  serviceId: z.string().min(1),
  variantId: z.string().min(1),
  startsAt: z.string().min(1),
  therapistId: z.string().optional(),
  notes: z.string().max(2000).optional(),
  // Health-fund claim (walk-in / staff-created bookings). When checked, all
  // four fund fields below are required and a fresh signature is captured.
  claimWithHealthFund: z.string().optional(),
  healthFundName: z.string().max(80).optional(),
  healthFundMemberNumber: z.string().max(40).optional(),
  reasonForTreatment: z.string().max(2000).optional(),
  // PNG data URL from the in-clinic signature pad. 150 KB ceiling matches the
  // public confirm action — typical signatures are 5–20 KB. Required for
  // health-fund claims and pregnancy bookings (full intake); plain non-claim
  // bookings use the consent tick-box below instead.
  signatureDataUrl: z.string().max(150_000).optional(),
  // Consent tick-box for plain non-claim bookings — stands in for the drawn
  // signature at the counter. "on" when staff confirm the client consents.
  consentToTreat: z.string().optional(),
  // --- Full clinical intake (captured for health-fund claims & pregnancy) ---
  // Mirrors the customer confirm-flow intake. Most are optional at the schema
  // level; the action enforces the required subset when full intake applies.
  medicalHistory: z.string().max(2000).optional(), // JSON array of condition codes
  medicalConditions: z.string().max(2000).optional(),
  medications: z.string().max(2000).optional(),
  allergies: z.string().max(2000).optional(),
  injuries: z.string().max(2000).optional(),
  painLocationCodes: z.string().max(2000).optional(), // JSON array of body-diagram codes
  painScale: z.string().optional(),
  painOnset: z.string().max(500).optional(),
  painHistory: z.string().max(2000).optional(),
  treatmentGoals: z.string().max(2000).optional(),
  pregnancy: z.string().optional(),
  pregnancyWeeks: z.string().optional(),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactRelationship: z.string().max(80).optional(),
  emergencyContactPhone: z.string().max(40).optional(),
  // Patient demographics saved on the User record.
  dob: z.string().optional(),
  gender: z.string().max(40).optional(),
  gpName: z.string().max(120).optional(),
  gpClinic: z.string().max(200).optional(),
  gpPhone: z.string().max(40).optional(),
});

// Server-side client search for the booking-create form. Mirrors the
// /staff/clients page search shape (token-split AND-of-OR over name +
// email + phone-digits + externalId + suburb + postcode + notes + booking
// reference + health-fund member number) so the two surfaces feel
// identical to the admin. The page used to preload `take: 500` rows and
// filter in the browser, but the clinic has ~4,200 imported clients (see
// lib/phone.ts header) so most were unreachable.
export async function searchClients(
  q: string,
): Promise<{
  clients?: Array<{ id: string; name: string; email: string; phone: string | null }>;
  error?: string;
}> {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  ) {
    return { error: "Forbidden." };
  }
  const term = (q ?? "").trim().slice(0, 200);
  if (term === "") {
    const clients = await db.user.findMany({
      where: { role: "CLIENT" },
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { name: "asc" },
      take: 50,
    });
    return { clients };
  }
  const tokens = term
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const where = {
    role: "CLIENT" as const,
    AND: tokens.map((t) => {
      const digits = t.replace(/[^\d+]/g, "");
      return {
        OR: [
          { name: { contains: t } },
          { email: { contains: t } },
          { phone: { contains: digits || t } },
          { externalId: { contains: t } },
          { suburb: { contains: t } },
          { postcode: { contains: t } },
          { notes: { contains: t } },
          { bookings: { some: { reference: { contains: t.toUpperCase() } } } },
          { intakeForms: { some: { healthFundMemberNumber: { contains: t } } } },
        ],
      };
    }),
  };
  const clients = await db.user.findMany({
    where,
    select: { id: true, name: true, email: true, phone: true },
    orderBy: { name: "asc" },
    take: 50,
  });
  return { clients };
}

function parseStringArrayJson(s: string | null): string[] {
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr)
      ? arr.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

// Fetch a returning client's most recent intake + the User-row demographics
// the staff full-intake form pre-fills from. Called from the form whenever a
// client is selected while the full intake (claim or pregnancy) is showing,
// so staff don't re-key unchanged medical history every visit. Signature is
// deliberately excluded — every visit needs a fresh drawn signature per the
// per-visit consent rule.
export async function getClientPrefill(clientId: string): Promise<{
  prefill?: {
    user: {
      dob: string;
      gender: string;
      gpName: string;
      gpClinic: string;
      gpPhone: string;
      healthFundName: string;
      healthFundMemberNumber: string;
    };
    intake: {
      medicalConditions: string;
      medications: string;
      allergies: string;
      injuries: string;
      medicalHistory: string[];
      painLocationCodes: string[];
      painScale: number | null;
      painOnset: string;
      painHistory: string;
      treatmentGoals: string;
      pregnancy: boolean;
      pregnancyWeeks: number | null;
      emergencyContactName: string;
      emergencyContactRelationship: string;
      emergencyContactPhone: string;
      reasonForTreatment: string;
    } | null;
  };
  error?: string;
}> {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  ) {
    return { error: "Forbidden." };
  }
  if (typeof clientId !== "string" || clientId.trim() === "") {
    return { error: "Missing client." };
  }

  const [user, intake] = await Promise.all([
    db.user.findUnique({
      where: { id: clientId },
      select: {
        role: true,
        dob: true,
        gender: true,
        gpName: true,
        gpClinic: true,
        gpPhone: true,
        healthFundName: true,
        healthFundMemberNumber: true,
      },
    }),
    db.intakeForm.findFirst({
      where: { userId: clientId },
      orderBy: { updatedAt: "desc" },
      select: {
        medicalConditions: true,
        medications: true,
        allergies: true,
        injuries: true,
        medicalHistory: true,
        painLocationCodes: true,
        painScale: true,
        painOnset: true,
        painHistory: true,
        treatmentGoals: true,
        pregnancy: true,
        pregnancyWeeks: true,
        emergencyContactName: true,
        emergencyContactRelationship: true,
        emergencyContactPhone: true,
        reasonForTreatment: true,
      },
    }),
  ]);

  if (!user || user.role !== "CLIENT") {
    return { error: "Client not found." };
  }

  await audit({
    userId: session.user.id,
    action: "VIEW_CLIENT_INTAKE_FOR_BOOKING",
    resource: `User:${clientId}`,
    metadata: { hasIntake: !!intake },
  });

  return {
    prefill: {
      user: {
        dob: user.dob ? user.dob.toISOString().slice(0, 10) : "",
        gender: user.gender ?? "",
        gpName: user.gpName ?? "",
        gpClinic: user.gpClinic ?? "",
        gpPhone: user.gpPhone ?? "",
        healthFundName: user.healthFundName ?? "",
        healthFundMemberNumber: user.healthFundMemberNumber ?? "",
      },
      intake: intake
        ? {
            medicalConditions: intake.medicalConditions ?? "",
            medications: intake.medications ?? "",
            allergies: intake.allergies ?? "",
            injuries: intake.injuries ?? "",
            medicalHistory: parseStringArrayJson(intake.medicalHistory),
            painLocationCodes: parseStringArrayJson(intake.painLocationCodes),
            painScale: intake.painScale,
            painOnset: intake.painOnset ?? "",
            painHistory: intake.painHistory ?? "",
            treatmentGoals: intake.treatmentGoals ?? "",
            pregnancy: intake.pregnancy ?? false,
            pregnancyWeeks: intake.pregnancyWeeks ?? null,
            emergencyContactName: intake.emergencyContactName ?? "",
            emergencyContactRelationship:
              intake.emergencyContactRelationship ?? "",
            emergencyContactPhone: intake.emergencyContactPhone ?? "",
            reasonForTreatment: intake.reasonForTreatment ?? "",
          }
        : null,
    },
  };
}

export async function createStaffBooking(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string; reference?: string }> {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  )
    return { error: "Forbidden." };

  const raw: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string") raw[k] = v;
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid input." };
  const data = parsed.data;

  const variant = await db.serviceVariant.findUnique({
    where: { id: data.variantId },
    include: { service: true },
  });
  if (!variant) return { error: "Service variant not found." };

  // Per-visit consent + intake. Two high-risk cases need the full clinical
  // intake plus a fresh drawn signature:
  //   - Health-fund (HiCAPS) claims — signature embedded on the invoice PDF
  //     for the rebate audit, plus fund details.
  //   - Pregnancy (the Pregnancy Massage service, or a client flagged pregnant
  //     on any service) — safety screening + signed acknowledgement.
  // Plain non-claim bookings (e.g. a walk-in relaxation massage) just record
  // consent via a tick-box so staff aren't slowed down at the counter. Either
  // way the IntakeForm row below stores consentToTreat=true with a timestamp.
  const claimWithHealthFund = data.claimWithHealthFund === "on";
  const isPregnancyService = variant.service.slug === "pregnancy-massage";
  const isPregnant = data.pregnancy === "on" || isPregnancyService;
  const requireFullIntake = claimWithHealthFund || isPregnant;
  const hasSignature =
    !!data.signatureDataUrl &&
    data.signatureDataUrl.startsWith("data:image/png;base64,");

  if (requireFullIntake) {
    if (!hasSignature) {
      return {
        error: claimWithHealthFund
          ? "Please ask the client to sign to authorise the health fund claim."
          : "Please ask the client to sign to acknowledge the pregnancy-massage safety information.",
      };
    }
    // Safety-critical intake fields, required for both claim and pregnancy.
    const requiredIntake: Array<[string | undefined, string]> = [
      [data.medicalConditions, "medical conditions (write 'none' if none)"],
      [data.medications, "current medications (write 'none' if none)"],
      [data.allergies, "allergies (write 'none' if none)"],
      [data.injuries, "recent injuries / areas to avoid"],
      [data.emergencyContactName, "emergency contact name"],
      [data.emergencyContactPhone, "emergency contact phone"],
    ];
    for (const [val, label] of requiredIntake) {
      if (!val || !val.trim()) {
        return { error: `Please complete the intake: ${label}.` };
      }
    }
    if (isPregnant) {
      const weeks = data.pregnancyWeeks
        ? parseInt(data.pregnancyWeeks, 10)
        : NaN;
      if (!Number.isFinite(weeks) || weeks < 1 || weeks > 45) {
        return { error: "Please enter how many weeks pregnant the client is." };
      }
    }
    if (claimWithHealthFund) {
      if (!variant.service.healthFundEligible) {
        return { error: "This treatment is not eligible for health fund rebates." };
      }
      if (!data.healthFundName || !data.healthFundName.trim())
        return { error: "Please choose the client's health fund." };
      if (!data.healthFundMemberNumber || !data.healthFundMemberNumber.trim())
        return { error: "Please enter the client's health fund member number." };
      if (!data.reasonForTreatment || !data.reasonForTreatment.trim())
        return { error: "Please describe the reason for treatment." };
    }
  } else if (data.consentToTreat !== "on") {
    return { error: "Please confirm the client consents to treatment." };
  }

  // The form's datetime-local input emits "YYYY-MM-DDTHH:mm" which `new Date(...)`
  // would parse as the server's local TZ (UTC on Vercel) — a 9:00 am Sydney
  // booking would land at 9:00 UTC = 7:00 pm Sydney, blowing past the 8:00 pm
  // cap. Parse it as Sydney-local instead, same as the reschedule action.
  const startsAt = sydneyLocalToUtc(data.startsAt);
  if (!startsAt || isNaN(startsAt.getTime()))
    return { error: "Invalid start time." };
  const endsAt = addMinutes(startsAt, variant.durationMin);

  const startMinutes = sydneyMinuteOfDay(startsAt);
  const endMinutes = sydneyMinuteOfDay(endsAt);
  const sameDay = sydneyDateOf(startsAt) === sydneyDateOf(endsAt);
  if (
    startMinutes < BOOKING_EARLIEST_START_MIN ||
    !sameDay ||
    endMinutes > BOOKING_LATEST_END_MIN
  )
    return { error: "Sessions must be between 9:00 am and 8:00 pm." };

  // Resolve client
  let clientId: string;
  let isWalkIn = false;
  if (data.mode === "existing") {
    if (!data.clientId) return { error: "Pick a client." };
    const u = await db.user.findUnique({ where: { id: data.clientId } });
    if (!u || u.role !== "CLIENT") return { error: "Client not found." };
    clientId = u.id;
  } else {
    if (!data.walkInName) return { error: "Walk-in name required." };
    isWalkIn = true;
    // Use provided email or generate a stable placeholder
    const fakeId = Math.random().toString(36).slice(2, 10);
    const email =
      data.walkInEmail && data.walkInEmail.trim()
        ? data.walkInEmail.trim().toLowerCase()
        : `walkin-${fakeId}@clinic.local`;
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      clientId = existing.id;
    } else {
      const tempPassword = await bcrypt.hash(
        `walkin-${fakeId}-${Date.now()}`,
        10,
      );
      const created = await db.user.create({
        data: {
          email,
          name: data.walkInName,
          phone: data.walkInPhone || null,
          passwordHash: tempPassword,
          role: "CLIENT",
        },
      });
      clientId = created.id;
    }
  }

  // When the full intake applies, fold the patient demographics the staff
  // entered into the client's User record (only the fields they actually
  // filled — never blank out existing data).
  if (requireFullIntake) {
    const dobDate =
      data.dob && /^\d{4}-\d{2}-\d{2}$/.test(data.dob)
        ? new Date(data.dob)
        : null;
    const userPatch: Record<string, unknown> = {};
    if (dobDate && !isNaN(dobDate.getTime())) userPatch.dob = dobDate;
    if (data.gender) userPatch.gender = data.gender;
    if (data.gpName) userPatch.gpName = data.gpName;
    if (data.gpClinic) userPatch.gpClinic = data.gpClinic;
    if (data.gpPhone) userPatch.gpPhone = data.gpPhone;
    if (Object.keys(userPatch).length > 0) {
      await db.user.update({ where: { id: clientId }, data: userPatch });
    }
  }

  // Therapist resolution: explicit pick or auto-assign.
  // Use Sydney day-of-week — startsAt.getDay() returns UTC on Vercel and is
  // off-by-one for early-morning Sydney times.
  const dow = sydneyDow(sydneyDateOf(startsAt));
  const therapists = await db.therapist.findMany({
    where: {
      active: true,
      ...(data.therapistId ? { id: data.therapistId } : {}),
    },
    include: {
      availability: { where: { dayOfWeek: dow } },
      bookings: {
        where: {
          status: { in: ["PENDING", "CONFIRMED"] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      },
      timeOff: {
        where: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      },
    },
  });
  const candidate = therapists.find(
    (t) =>
      t.availability.some(
        (a) => a.startMin <= startMinutes && a.endMin >= endMinutes,
      ) &&
      t.bookings.length === 0 &&
      t.timeOff.length === 0,
  );
  if (!candidate)
    return { error: "No therapist available at that time (or chosen therapist is busy)." };

  const reference = bookingReference();
  const booking = await db.booking.create({
    data: {
      reference,
      clientId,
      serviceId: variant.serviceId,
      variantId: variant.id,
      therapistId: candidate.id,
      startsAt,
      endsAt,
      status: "CONFIRMED",
      priceCentsAtBooking: variant.priceCents,
      notes: data.notes ?? null,
      isWalkIn,
      claimWithHealthFund,
    },
  });

  // Every booking persists a fresh IntakeForm row for the per-visit consent.
  // Plain non-claim bookings stop at the consent flags (the rest of the
  // clinical record is captured on the booking detail page after the session).
  // Health-fund claims and pregnancy bookings carry the full clinical intake
  // collected in the form above, mirroring the customer confirm flow.
  let painScale: number | null = null;
  if (requireFullIntake && data.painScale) {
    const n = parseInt(data.painScale, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 10) painScale = n;
  }
  const pregnancyWeeks =
    isPregnant && data.pregnancyWeeks
      ? (() => {
          const n = parseInt(data.pregnancyWeeks, 10);
          return Number.isFinite(n) && n >= 1 && n <= 45 ? n : null;
        })()
      : null;

  await db.intakeForm.create({
    data: {
      userId: clientId,
      ...(requireFullIntake
        ? {
            medicalHistory: data.medicalHistory ?? null,
            medicalConditions: data.medicalConditions ?? null,
            medications: data.medications ?? null,
            allergies: data.allergies ?? null,
            injuries: data.injuries ?? null,
            painLocationCodes: data.painLocationCodes ?? null,
            painScale,
            painOnset: data.painOnset ?? null,
            painHistory: data.painHistory ?? null,
            treatmentGoals: data.treatmentGoals ?? null,
            pregnancy: isPregnant,
            pregnancyWeeks,
            emergencyContactName: data.emergencyContactName ?? null,
            emergencyContactRelationship:
              data.emergencyContactRelationship ?? null,
            emergencyContactPhone: data.emergencyContactPhone ?? null,
          }
        : {}),
      healthFundName: claimWithHealthFund ? (data.healthFundName ?? null) : null,
      healthFundMemberNumber: claimWithHealthFund
        ? (data.healthFundMemberNumber ?? null)
        : null,
      reasonForTreatment: claimWithHealthFund
        ? (data.reasonForTreatment ?? null)
        : null,
      consentToTreat: true,
      consentToStore: true,
      signedAt: new Date(),
      signatureDataUrl: data.signatureDataUrl ?? null,
    },
  });

  await audit({
    userId: session.user.id,
    action: "CREATE_BOOKING_STAFF",
    resource: `Booking:${booking.id}`,
    metadata: {
      reference,
      isWalkIn,
      claimWithHealthFund,
      isPregnant,
      fullIntake: requireFullIntake,
      ...(claimWithHealthFund
        ? { healthFundName: data.healthFundName ?? null }
        : {}),
    },
  });
  revalidatePath("/staff/bookings");
  revalidatePath("/staff/schedule");
  return { ok: true, reference };
}
