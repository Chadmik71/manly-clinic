"use server";
import { z } from "zod";
import { addMinutes } from "date-fns";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { bookingReference } from "@/lib/utils";
import {
  BOOKING_LATEST_END_MIN,
  BOOKING_EARLIEST_START_MIN,
} from "@/lib/clinic";
import { notifyBookingConfirmed } from "@/lib/notify";
import { headers } from "next/headers";

const schema = z.object({
  serviceId: z.string().min(1),
  variantId: z.string().min(1),
  startsIso: z.string().min(1),
  notes: z.string().max(2000).optional(),
  // Patient demographics (saved on User)
  dob: z.string().optional(),
  gender: z.string().max(40).optional(),
  addressLine1: z.string().max(200).optional(),
  suburb: z.string().max(120).optional(),
  stateRegion: z.string().max(20).optional(),
  postcode: z.string().max(10).optional(),
  gpName: z.string().max(120).optional(),
  gpClinic: z.string().max(200).optional(),
  gpPhone: z.string().max(40).optional(),
  // Intake
  medicalHistory: z.string().max(2000).optional(),
  medicalConditions: z.string().max(2000).optional(),
  medications: z.string().max(2000).optional(),
  allergies: z.string().max(2000).optional(),
  injuries: z.string().max(2000).optional(),
  painLocation: z.string().max(500).optional(),
  painScale: z.string().optional(),
  painOnset: z.string().max(500).optional(),
  painHistory: z.string().max(2000).optional(),
  treatmentGoals: z.string().max(2000).optional(),
  pregnancy: z.string().optional(),
  pregnancyWeeks: z.string().optional(),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactRelationship: z.string().max(80).optional(),
  emergencyContactPhone: z.string().max(40).optional(),
  consentToTreat: z.string().optional(),
  consentToStore: z.string().optional(),
  claimWithHealthFund: z.string().optional(),
  healthFundName: z.string().max(80).optional(),
  healthFundMemberNumber: z.string().max(40).optional(),
  reasonForTreatment: z.string().max(2000).optional(),
  voucherCode: z.string().max(40).optional(),
});

function nonEmpty(s: string | undefined): boolean {
  return !!s && s.trim().length > 0;
}

export async function createBooking(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string; reference?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in required." };

  const raw: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string") raw[k] = v;
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid input." };
  const data = parsed.data;

  if (data.consentToTreat !== "on" || data.consentToStore !== "on") {
    return { error: "Treatment and storage consent are required." };
  }

  const variant = await db.serviceVariant.findUnique({
    where: { id: data.variantId },
    include: { service: true },
  });
  if (!variant || variant.serviceId !== data.serviceId)
    return { error: "Selected treatment not found." };

  // Health-fund claim validation: only allowed for eligible services, and
  // when claimed, intake + fund details become required.
  const claimWithHealthFund = data.claimWithHealthFund === "on";
  if (claimWithHealthFund && !variant.service.healthFundEligible) {
    return { error: "This treatment is not eligible for health fund rebates." };
  }
  if (claimWithHealthFund) {
    if (!nonEmpty(data.healthFundName))
      return { error: "Please choose your health fund." };
    if (!nonEmpty(data.healthFundMemberNumber))
      return { error: "Please enter your health fund member number." };
    if (!nonEmpty(data.reasonForTreatment))
      return { error: "Please describe the reason for treatment." };
    const requiredIntake: Array<[string, string]> = [
      ["medicalConditions", "medical conditions"],
      ["medications", "medications"],
      ["allergies", "allergies"],
      ["injuries", "recent injuries / areas to avoid"],
      ["emergencyContactName", "emergency contact name"],
      ["emergencyContactPhone", "emergency contact phone"],
    ];
    for (const [key, label] of requiredIntake) {
      if (!nonEmpty((data as Record<string, string | undefined>)[key])) {
        return {
          error: `Health fund claims require a complete intake form — please fill in ${label} (write 'none' if not applicable).`,
        };
      }
    }
  }

  const startsAt = new Date(data.startsIso);
  if (isNaN(startsAt.getTime()) || startsAt < new Date())
    return { error: "Selected time is no longer valid." };
  const endsAt = addMinutes(startsAt, variant.durationMin);

  // Clinic-wide policy: bookings must finish by 8:00 pm and start no
  // earlier than 9:00 am, regardless of per-therapist availability.
  const startMinutes = startsAt.getHours() * 60 + startsAt.getMinutes();
  const endMinutes = endsAt.getHours() * 60 + endsAt.getMinutes();
  const sameDay =
    endsAt.getFullYear() === startsAt.getFullYear() &&
    endsAt.getMonth() === startsAt.getMonth() &&
    endsAt.getDate() === startsAt.getDate();
  if (
    startMinutes < BOOKING_EARLIEST_START_MIN ||
    !sameDay ||
    endMinutes > BOOKING_LATEST_END_MIN
  ) {
    const cap = `${Math.floor(BOOKING_LATEST_END_MIN / 60) % 12 || 12}:${String(BOOKING_LATEST_END_MIN % 60).padStart(2, "0")} pm`;
    return { error: `Sessions must finish by ${cap}. Please pick an earlier time.` };
  }

  // Find an available therapist for this slot
  const dow = startsAt.getDay();
  const therapists = await db.therapist.findMany({
    where: { active: true },
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
  if (!candidate) return { error: "That time was just taken — please pick another." };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = h.get("user-agent") ?? null;

  // Persist intake (latest snapshot)
  const isPregnant = data.pregnancy === "on";
  const weeksRaw = data.pregnancyWeeks
    ? parseInt(data.pregnancyWeeks, 10)
    : NaN;
  const pregnancyWeeks =
    isPregnant && Number.isFinite(weeksRaw) && weeksRaw >= 1 && weeksRaw <= 45
      ? weeksRaw
      : null;
  if (isPregnant && pregnancyWeeks === null) {
    return { error: "Please tell us how many weeks pregnant you are." };
  }
  // Save patient demographics on the User row (idempotent — only updates
  // fields the client provided in this submission).
  const dobDate =
    data.dob && /^\d{4}-\d{2}-\d{2}$/.test(data.dob) ? new Date(data.dob) : null;
  const userPatch: Record<string, unknown> = {};
  if (dobDate && !isNaN(dobDate.getTime())) userPatch.dob = dobDate;
  if (data.gender) userPatch.gender = data.gender;
  if (data.addressLine1) userPatch.addressLine1 = data.addressLine1;
  if (data.suburb) userPatch.suburb = data.suburb;
  if (data.stateRegion) userPatch.stateRegion = data.stateRegion;
  if (data.postcode) userPatch.postcode = data.postcode;
  if (data.gpName) userPatch.gpName = data.gpName;
  if (data.gpClinic) userPatch.gpClinic = data.gpClinic;
  if (data.gpPhone) userPatch.gpPhone = data.gpPhone;
  if (Object.keys(userPatch).length > 0) {
    await db.user.update({
      where: { id: session.user.id },
      data: userPatch,
    });
  }

  // Pain scale (0-10)
  let painScale: number | null = null;
  if (data.painScale) {
    const n = parseInt(data.painScale, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 10) painScale = n;
  }

  await db.intakeForm.create({
    data: {
      userId: session.user.id,
      medicalConditions: data.medicalConditions ?? null,
      medications: data.medications ?? null,
      allergies: data.allergies ?? null,
      injuries: data.injuries ?? null,
      medicalHistory: data.medicalHistory ?? null,
      painLocation: data.painLocation ?? null,
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
      healthFundName: claimWithHealthFund ? data.healthFundName : null,
      healthFundMemberNumber: claimWithHealthFund
        ? data.healthFundMemberNumber
        : null,
      reasonForTreatment: claimWithHealthFund
        ? data.reasonForTreatment
        : null,
      consentToTreat: true,
      consentToStore: true,
      signedAt: new Date(),
    },
  });

  // Persist consent records (auditable)
  await db.consentRecord.createMany({
    data: [
      {
        userId: session.user.id,
        type: "TREATMENT",
        version: "1.0",
        granted: true,
        ipAddress: ip,
        userAgent: ua,
      },
      {
        userId: session.user.id,
        type: "HEALTH_INFO_STORAGE",
        version: "1.0",
        granted: true,
        ipAddress: ip,
        userAgent: ua,
      },
    ],
  });

  // Voucher redemption (optional, validated server-side)
  let voucherCode: string | null = null;
  let voucherAppliedCents = 0;
  if (data.voucherCode && data.voucherCode.trim()) {
    const code = data.voucherCode.trim().toUpperCase();
    const v = await db.voucher.findUnique({ where: { code } });
    if (!v) return { error: "Voucher code not found." };
    if (v.status !== "ACTIVE")
      return { error: `Voucher is ${v.status.toLowerCase()}.` };
    if (v.expiresAt && v.expiresAt < new Date())
      return { error: "Voucher has expired." };
    if (v.balanceCents <= 0)
      return { error: "Voucher has no remaining balance." };
    voucherCode = v.code;
    voucherAppliedCents = Math.min(v.balanceCents, variant.priceCents);
  }

  const reference = bookingReference();
  const booking = await db.booking.create({
    data: {
      reference,
      clientId: session.user.id,
      serviceId: variant.serviceId,
      variantId: variant.id,
      therapistId: candidate.id,
      startsAt,
      endsAt,
      status: "CONFIRMED",
      priceCentsAtBooking: variant.priceCents,
      claimWithHealthFund,
      voucherCode,
      voucherAppliedCents,
      paidCents: voucherAppliedCents, // voucher amount counts as paid
      notes: data.notes ?? null,
    },
  });

  // Decrement voucher balance
  if (voucherCode && voucherAppliedCents > 0) {
    await db.voucher.update({
      where: { code: voucherCode },
      data: {
        balanceCents: { decrement: voucherAppliedCents },
        status:
          (await db.voucher.findUnique({ where: { code: voucherCode } }))!
            .balanceCents -
            voucherAppliedCents <=
          0
            ? "REDEEMED"
            : "ACTIVE",
      },
    });
    await audit({
      userId: session.user.id,
      action: "REDEEM_VOUCHER",
      resource: `Voucher:${voucherCode}`,
      metadata: { booking: reference, applied: voucherAppliedCents },
    });
  }

  await audit({
    userId: session.user.id,
    action: "CREATE_BOOKING",
    resource: `Booking:${booking.id}`,
    metadata: { reference, service: variant.service.name },
  });

  // Best-effort notification (never throws)
  await notifyBookingConfirmed({
    email: session.user.email,
    phone: null,
    name: session.user.name,
    reference,
    serviceName: variant.service.name,
    durationMin: variant.durationMin,
    startsAt,
  });

  return { ok: true, reference };
}
