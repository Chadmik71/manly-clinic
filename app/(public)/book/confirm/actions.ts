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
import { sydneyDateOf } from "@/lib/time";

// Sydney minute-of-day (0-1439). Robust against UTC server clock vs Sydney TZ.
// Vercel serverless runs in UTC, but the clinic operates on Sydney calendar time.
const SYDNEY_HM_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function sydneyMinuteOfDay(d: Date): number {
  const parts = SYDNEY_HM_FMT.formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

import { notifyBookingConfirmed } from "@/lib/notify";
import { headers } from "next/headers";
import { normalisePhone, isAuMobile } from "@/lib/phone";
import { findOrCreateUserForGuest } from "@/lib/user-merge";
import { applyHolidaySurcharge } from "@/lib/holidays";

const schema = z.object({
  serviceId: z.string().min(1),
  variantId: z.string().min(1),
  startsIso: z.string().min(1),
  notes: z.string().max(2000).optional(),

  // Guest contact details (when no session). Required at runtime; we
  // validate them after we know whether a session exists.
  guestName: z.string().max(120).optional(),
  guestEmail: z.string().max(254).optional(),
  guestPhone: z.string().max(40).optional(),

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

const guestSchema = z.object({
  guestName: z.string().min(1).max(120),
  guestEmail: z.string().email().max(254),
  guestPhone: z.string().min(1).max(40),
});

function nonEmpty(s: string | undefined): boolean {
  return !!s && s.trim().length > 0;
}

export async function createBooking(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string; reference?: string }> {
  const session = await auth();

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

  // -----------------------------------------------------------------------
  // Resolve the client (signed-in user OR guest -> findOrCreateUserForGuest)
  // -----------------------------------------------------------------------
  let clientUserId: string;
  let clientEmail: string;
  let clientName: string;
  let clientPhone: string | null;

  if (session?.user) {
    clientUserId = session.user.id;
    clientEmail = session.user.email ?? "";
    clientName = session.user.name ?? "";
    // Pull current phone off the user row (the JWT doesn't carry it).
    const u = await db.user.findUnique({
      where: { id: session.user.id },
      select: { phone: true },
    });
    clientPhone = u?.phone ?? null;
  } else {
    const g = guestSchema.safeParse({
      guestName: data.guestName,
      guestEmail: data.guestEmail,
      guestPhone: data.guestPhone,
    });
    if (!g.success) {
      return { error: "Please enter your name, email and mobile to continue." };
    }
    const phoneNorm = normalisePhone(g.data.guestPhone);
    if (!isAuMobile(phoneNorm)) {
      return {
        error:
          "Please enter a valid Australian mobile number (e.g. 0412 345 678).",
      };
    }
    const merge = await findOrCreateUserForGuest({
      name: g.data.guestName,
      email: g.data.guestEmail,
      phone: phoneNorm,
    });
    clientUserId = merge.userId;
    clientEmail = g.data.guestEmail.toLowerCase().trim();
    clientName = g.data.guestName.trim();
    clientPhone = phoneNorm;
    await audit({
      userId: merge.userId,
      action: merge.isNew ? "GUEST_CREATE_USER" : "GUEST_MATCH_EXISTING_USER",
      resource: `User:${merge.userId}`,
      metadata: {
        matchedBy: merge.matchedBy,
        upgradedEmail: merge.upgradedEmail,
      },
    });
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
  const pricing = applyHolidaySurcharge(variant.priceCents, startsAt);

  // Clinic-wide policy: bookings must finish by 8:00 pm and start no
  // earlier than 9:00 am, regardless of per-therapist availability.
  const startMinutes = sydneyMinuteOfDay(startsAt);
  const endMinutes = sydneyMinuteOfDay(endsAt);
  const sameDay =
    sydneyDateOf(startsAt) === sydneyDateOf(endsAt);
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
  if (!candidate)
    return { error: "That time was just taken — please pick another." };

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
      where: { id: clientUserId },
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
      userId: clientUserId,
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
      emergencyContactRelationship: data.emergencyContactRelationship ?? null,
      emergencyContactPhone: data.emergencyContactPhone ?? null,
      healthFundName: claimWithHealthFund ? data.healthFundName : null,
      healthFundMemberNumber: claimWithHealthFund
        ? data.healthFundMemberNumber
        : null,
      reasonForTreatment: claimWithHealthFund ? data.reasonForTreatment : null,
      consentToTreat: true,
      consentToStore: true,
      signedAt: new Date(),
    },
  });

  // Persist consent records (auditable)
  await db.consentRecord.createMany({
    data: [
      {
        userId: clientUserId,
        type: "TREATMENT",
        version: "1.0",
        granted: true,
        ipAddress: ip,
        userAgent: ua,
      },
      {
        userId: clientUserId,
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
    voucherAppliedCents = Math.min(v.balanceCents, pricing.finalPriceCents);
  }

  const reference = bookingReference();
  const booking = await db.booking.create({
    data: {
      reference,
      clientId: clientUserId,
      serviceId: variant.serviceId,
      variantId: variant.id,
      therapistId: candidate.id,
      startsAt,
      endsAt,
      status: "CONFIRMED",
      priceCentsAtBooking: pricing.finalPriceCents,
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
      userId: clientUserId,
      action: "REDEEM_VOUCHER",
      resource: `Voucher:${voucherCode}`,
      metadata: { booking: reference, applied: voucherAppliedCents },
    });
  }

  await audit({
    userId: clientUserId,
    action: "CREATE_BOOKING",
    resource: `Booking:${booking.id}`,
    metadata: {
      reference,
      service: variant.service.name,
      guestCheckout: !session?.user,
      holidayName: pricing.holidayName,
      holidaySurchargeCents: pricing.surchargeCents,
    },
  });

  // Best-effort notification (never throws)
  await notifyBookingConfirmed({
    email: clientEmail,
    phone: clientPhone,
    name: clientName,
    reference,
    serviceName: variant.service.name,
    durationMin: variant.durationMin,
    startsAt,
  });

  return { ok: true, reference };
}
