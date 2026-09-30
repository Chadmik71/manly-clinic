// Completing the full medical form for a booking made without it: a phone
// booking, or a client who chose "fill it in later" when booking online.
// Shared by the staff "Complete medical form" box on the booking page and
// the client's own online health form (/portal/bookings/[id]/health-form).
// Callers do their own permission check first.

import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { parseHistory } from "@/lib/intake";

export const intakeCompletionSchema = z.object({
  claimWithHealthFund: z.string().optional(),
  healthFundName: z.string().max(80).optional(),
  healthFundMemberNumber: z.string().max(40).optional(),
  reasonForTreatment: z.string().max(2000).optional(),
  // PNG data URL from the signature pad, same 150 KB ceiling as the
  // new-booking form and the public confirm action.
  signatureDataUrl: z.string().max(150_000).optional(),
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
  dob: z.string().optional(),
  gender: z.string().max(40).optional(),
  gpName: z.string().max(120).optional(),
  gpClinic: z.string().max(200).optional(),
  gpPhone: z.string().max(40).optional(),
});

/** Error wording depends on who is filling the form in. */
const MESSAGES = {
  staff: {
    sign: "Please ask the client to sign the medical form.",
    weeks: "Please enter how many weeks pregnant the client is.",
    fund: "Please choose the client's health fund.",
    member: "Please enter the client's health fund member number.",
  },
  client: {
    sign: "Please sign the form.",
    weeks: "Please enter how many weeks pregnant you are.",
    fund: "Please choose your health fund.",
    member: "Please enter your health fund member number.",
  },
} as const;

export type IntakeWho = keyof typeof MESSAGES;

/**
 * Validate and save a completed medical form for `bookingId`: always a fresh
 * IntakeForm row (per-visit consent and signature), demographics folded into
 * the client record, and the booking's health-fund claim set to match.
 */
export async function saveBookingIntake(args: {
  bookingId: string;
  fd: FormData;
  actorUserId: string;
  who: IntakeWho;
  auditAction: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const msg = MESSAGES[args.who];
  const raw: Record<string, string> = {};
  args.fd.forEach((v, k) => {
    if (typeof v === "string") raw[k] = v;
  });
  const parsed = intakeCompletionSchema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid input." };
  const data = parsed.data;

  const booking = await db.booking.findUnique({
    where: { id: args.bookingId },
    include: { service: true },
  });
  if (!booking) return { error: "Booking not found." };
  if (booking.status === "CANCELLED")
    return { error: "This booking has been cancelled." };

  const claimWithHealthFund = data.claimWithHealthFund === "on";
  const isPregnancyService = booking.service.slug === "pregnancy-massage";
  const isPregnant = data.pregnancy === "on" || isPregnancyService;

  const hasSignature =
    !!data.signatureDataUrl &&
    data.signatureDataUrl.startsWith("data:image/png;base64,");
  if (!hasSignature) return { error: msg.sign };

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
      return { error: `Please complete the medical form: ${label}.` };
    }
  }
  if (isPregnant) {
    const weeks = data.pregnancyWeeks ? parseInt(data.pregnancyWeeks, 10) : NaN;
    if (!Number.isFinite(weeks) || weeks < 1 || weeks > 45) {
      return { error: msg.weeks };
    }
  }
  if (claimWithHealthFund) {
    if (!booking.service.healthFundEligible)
      return { error: "This treatment is not eligible for health fund rebates." };
    if (!data.healthFundName || !data.healthFundName.trim())
      return { error: msg.fund };
    if (!data.healthFundMemberNumber || !data.healthFundMemberNumber.trim())
      return { error: msg.member };
    if (!data.reasonForTreatment || !data.reasonForTreatment.trim())
      return { error: "Please describe the reason for treatment." };
  }

  // Fold the demographics into the client's User record — only the fields
  // actually filled in, never blank out existing data.
  const dobDate =
    data.dob && /^\d{4}-\d{2}-\d{2}$/.test(data.dob) ? new Date(data.dob) : null;
  const userPatch: Record<string, unknown> = {};
  if (dobDate && !isNaN(dobDate.getTime())) userPatch.dob = dobDate;
  if (data.gender) userPatch.gender = data.gender;
  if (data.gpName) userPatch.gpName = data.gpName;
  if (data.gpClinic) userPatch.gpClinic = data.gpClinic;
  if (data.gpPhone) userPatch.gpPhone = data.gpPhone;
  if (Object.keys(userPatch).length > 0) {
    await db.user.update({ where: { id: booking.clientId }, data: userPatch });
  }

  let painScale: number | null = null;
  if (data.painScale) {
    const n = parseInt(data.painScale, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 10) painScale = n;
  }
  const pregnancyWeeks =
    isPregnant && data.pregnancyWeeks
      ? (() => {
          const n = parseInt(data.pregnancyWeeks!, 10);
          return Number.isFinite(n) && n >= 1 && n <= 45 ? n : null;
        })()
      : null;

  await db.intakeForm.create({
    data: {
      userId: booking.clientId,
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
      emergencyContactRelationship: data.emergencyContactRelationship ?? null,
      emergencyContactPhone: data.emergencyContactPhone ?? null,
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

  if (booking.claimWithHealthFund !== claimWithHealthFund) {
    await db.booking.update({
      where: { id: args.bookingId },
      data: { claimWithHealthFund },
    });
  }

  await audit({
    userId: args.actorUserId,
    action: args.auditAction,
    resource: `Booking:${args.bookingId}`,
    metadata: {
      claimWithHealthFund,
      isPregnant,
      ...(claimWithHealthFund
        ? { healthFundName: data.healthFundName ?? null }
        : {}),
    },
  });

  return { ok: true };
}

export type IntakePrefill = {
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

/** Pre-fill for the form: the client's demographics and last full intake. */
export async function getIntakePrefill(clientId: string): Promise<IntakePrefill> {
  const [clientDemo, priorFullIntake] = await Promise.all([
    db.user.findUnique({
      where: { id: clientId },
      select: {
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
      where: { userId: clientId, AND: [{ medicalConditions: { not: null } }, { medicalConditions: { not: "" } }] },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return {
    user: {
      dob: clientDemo?.dob ? clientDemo.dob.toISOString().slice(0, 10) : "",
      gender: clientDemo?.gender ?? "",
      gpName: clientDemo?.gpName ?? "",
      gpClinic: clientDemo?.gpClinic ?? "",
      gpPhone: clientDemo?.gpPhone ?? "",
      healthFundName: clientDemo?.healthFundName ?? "",
      healthFundMemberNumber: clientDemo?.healthFundMemberNumber ?? "",
    },
    intake: priorFullIntake
      ? {
          medicalConditions: priorFullIntake.medicalConditions ?? "",
          medications: priorFullIntake.medications ?? "",
          allergies: priorFullIntake.allergies ?? "",
          injuries: priorFullIntake.injuries ?? "",
          medicalHistory: parseHistory(priorFullIntake.medicalHistory),
          painLocationCodes: parseHistory(priorFullIntake.painLocationCodes),
          painScale: priorFullIntake.painScale,
          painOnset: priorFullIntake.painOnset ?? "",
          painHistory: priorFullIntake.painHistory ?? "",
          treatmentGoals: priorFullIntake.treatmentGoals ?? "",
          pregnancy: priorFullIntake.pregnancy ?? false,
          pregnancyWeeks: priorFullIntake.pregnancyWeeks ?? null,
          emergencyContactName: priorFullIntake.emergencyContactName ?? "",
          emergencyContactRelationship:
            priorFullIntake.emergencyContactRelationship ?? "",
          emergencyContactPhone: priorFullIntake.emergencyContactPhone ?? "",
          reasonForTreatment: priorFullIntake.reasonForTreatment ?? "",
        }
      : null,
  };
}

type BookingForFormCheck = {
  id: string;
  clientId: string;
  createdAt: Date;
  status: string;
  service: { healthFundEligible: boolean; slug: string };
};

/**
 * Which of these bookings still need the client's health form: upcoming
 * Remedial (health-fund eligible) or Pregnancy bookings with no full medical
 * form saved since the booking was made. A form filled in during online
 * booking is saved in the same request as the booking, so allow a couple of
 * minutes either side of createdAt.
 */
export async function bookingsNeedingHealthForm(
  bookings: BookingForFormCheck[],
): Promise<Set<string>> {
  const candidates = bookings.filter(
    (b) =>
      (b.status === "PENDING" || b.status === "CONFIRMED") &&
      (b.service.healthFundEligible || b.service.slug === "pregnancy-massage"),
  );
  if (candidates.length === 0) return new Set();
  const clientIds = [...new Set(candidates.map((b) => b.clientId))];
  const forms = await db.intakeForm.findMany({
    where: { userId: { in: clientIds }, AND: [{ medicalConditions: { not: null } }, { medicalConditions: { not: "" } }] },
    select: { userId: true, createdAt: true },
  });
  const GRACE_MS = 2 * 60 * 1000;
  return new Set(
    candidates
      .filter(
        (b) =>
          !forms.some(
            (f) => f.userId === b.clientId && f.createdAt.getTime() >= b.createdAt.getTime() - GRACE_MS,
          ),
      )
      .map((b) => b.id),
  );
}
