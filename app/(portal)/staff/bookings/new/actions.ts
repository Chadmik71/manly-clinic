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
import { sydneyDateOf, sydneyDow } from "@/lib/time";

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
  // public confirm action — typical signatures are 5–20 KB.
  signatureDataUrl: z.string().max(150_000).optional(),
});

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

  // Health-fund claim validation. Mirrors the public confirm flow: the four
  // HiCAPS audit fields (fund, member#, reason, signature) are all-or-nothing.
  const claimWithHealthFund = data.claimWithHealthFund === "on";
  if (claimWithHealthFund) {
    if (!variant.service.healthFundEligible) {
      return { error: "This treatment is not eligible for health fund rebates." };
    }
    if (
      !data.signatureDataUrl ||
      !data.signatureDataUrl.startsWith("data:image/png;base64,")
    ) {
      return {
        error:
          "Please ask the client to sign in the signature pad to authorise the health-fund claim.",
      };
    }
    if (!data.healthFundName || !data.healthFundName.trim())
      return { error: "Please choose the client's health fund." };
    if (!data.healthFundMemberNumber || !data.healthFundMemberNumber.trim())
      return { error: "Please enter the client's health fund member number." };
    if (!data.reasonForTreatment || !data.reasonForTreatment.trim())
      return { error: "Please describe the reason for treatment." };
  }

  const startsAt = new Date(data.startsAt);
  if (isNaN(startsAt.getTime())) return { error: "Invalid start time." };
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

  // When the client is claiming via HiCAPS today, persist the signature +
  // fund metadata as a fresh IntakeForm row. The walk-in flow doesn't
  // collect a full clinical intake at the counter; staff captures the
  // remaining fields on the booking detail page after the session, but the
  // HiCAPS-required pieces (fund, member#, reason, signature) are locked in
  // here with consent flags so the audit trail starts at booking time.
  if (claimWithHealthFund) {
    await db.intakeForm.create({
      data: {
        userId: clientId,
        healthFundName: data.healthFundName ?? null,
        healthFundMemberNumber: data.healthFundMemberNumber ?? null,
        reasonForTreatment: data.reasonForTreatment ?? null,
        consentToTreat: true,
        consentToStore: true,
        signedAt: new Date(),
        signatureDataUrl: data.signatureDataUrl ?? null,
      },
    });
  }

  await audit({
    userId: session.user.id,
    action: "CREATE_BOOKING_STAFF",
    resource: `Booking:${booking.id}`,
    metadata: {
      reference,
      isWalkIn,
      claimWithHealthFund,
      ...(claimWithHealthFund
        ? { healthFundName: data.healthFundName ?? null }
        : {}),
    },
  });
  revalidatePath("/staff/bookings");
  revalidatePath("/staff/schedule");
  return { ok: true, reference };
}
