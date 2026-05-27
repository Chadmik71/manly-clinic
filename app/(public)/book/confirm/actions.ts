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
import { sydneyDateOf, sydneyDow } from "@/lib/time";

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
import { getStripe, depositCents, depositsEnabled } from "@/lib/stripe";
import { getClinicSettingsSafe } from "@/lib/clinic-settings";

/**
 * Read-only voucher lookup used by the "Apply" button in the booking confirm
 * form. Returns what would be deducted *if* this voucher were redeemed against
 * the given service price, without touching the row. The actual redemption
 * (status flip / balance decrement) happens inside createBooking — keeping
 * this preview side-effect-free avoids partial-redeem states if the customer
 * applies but then abandons the booking.
 */
export async function previewVoucher(
  rawCode: string,
  servicePriceCents: number,
): Promise<
  | { ok: true; appliedCents: number; balanceCents: number; amountCents: number }
  | { ok: false; error: string }
> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a voucher code." };
  if (!Number.isFinite(servicePriceCents) || servicePriceCents <= 0)
    return { ok: false, error: "Could not determine service price." };

  const v = await db.voucher.findUnique({ where: { code } });
  if (!v) return { ok: false, error: "Voucher code not found." };
  if (v.status !== "ACTIVE")
    return { ok: false, error: `Voucher is ${v.status.toLowerCase().replace("_", " ")}.` };
  if (v.expiresAt && v.expiresAt < new Date())
    return { ok: false, error: "Voucher has expired." };
  if (v.balanceCents <= 0)
    return { ok: false, error: "Voucher has no remaining balance." };

  return {
    ok: true,
    appliedCents: Math.min(v.balanceCents, servicePriceCents),
    balanceCents: v.balanceCents,
    amountCents: v.amountCents,
  };
}

const schema = z.object({
  serviceId: z.string().min(1),
  variantId: z.string().min(1),
  startsIso: z.string().min(1),
  notes: z.string().max(2000).optional(),

  // Couple-massage extension. When partnerVariantId is set, the booking is
  // for two and a second linked Booking is created on a different therapist.
  // partnerName is optional but encouraged so reception knows who’s arriving.
  partnerVariantId: z.string().optional(),
  partnerName: z.string().max(120).optional(),

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
  // PNG data URL of the client's drawn signature. Required at runtime when
  // claimWithHealthFund is true (HICAPS audit). Capped at 150 KB to bound
  // request size — typical signatures are 5-20 KB.
  signatureDataUrl: z.string().max(150_000).optional(),
  // JSON-serialized array of body-diagram zone codes the customer marked.
  // Cap covers ~250 codes which is far beyond what the diagram offers.
  painLocationCodes: z.string().max(2000).optional(),
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

  // Deposit verification — when feature flag is on, the booking confirm form
  // attaches a Stripe PaymentIntent ID to the FormData. We verify here that
  // the PaymentIntent has actually succeeded, paid the expected amount, and
  // carries the booking_deposit metadata kind. Forged or mismatched intents
  // are refunded (if charged) and rejected.
  //
  // The deposit requirement is gated by both the env kill switch
  // (depositsEnabled()) and the admin-controlled runtime flag in
  // ClinicSetting. When either is off, the booking proceeds without a
  // deposit. The Safe variant falls back to defaults (deposits enabled) on
  // DB failure, preserving fail-closed behaviour.
  const paymentIntentIdFromFd = String(fd.get("paymentIntentId") ?? "").trim();
  let verifiedDepositCents = 0;
  let verifiedPaymentIntentId: string | null = null;

  const clinicSettings = await getClinicSettingsSafe();
  const requireDeposit = depositsEnabled() && clinicSettings.depositsEnabled;

  if (requireDeposit) {
    if (!paymentIntentIdFromFd) {
      return { error: "A deposit is required. Please refresh the page and try again." };
    }
    const stripe = getStripe();
    if (!stripe) {
      return { error: "Payment processing is temporarily unavailable. Please contact us." };
    }
    try {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentIdFromFd);
      if (pi.status !== "succeeded") {
        return { error: "Your payment did not complete. Please try again." };
      }
      const expectedAmount = depositCents();
      const amountOk = pi.amount === expectedAmount && pi.currency === "aud";
      const metadataOk = pi.metadata?.kind === "booking_deposit";
      if (!amountOk || !metadataOk) {
        // Suspicious payment — refund and reject.
        try {
          await stripe.refunds.create({ payment_intent: paymentIntentIdFromFd });
        } catch (refundErr) {
          console.error("Refund failed on suspicious payment:", refundErr);
        }
        await audit({
          action: "stripe.payment_intent.suspicious",
          resource: paymentIntentIdFromFd,
          metadata: {
            amount: pi.amount,
            currency: pi.currency,
            metadataKind: pi.metadata?.kind ?? null,
            expected: expectedAmount,
          },
        });
        return { error: "Payment validation failed. If you were charged, a refund has been initiated." };
      }
      verifiedDepositCents = pi.amount;
      verifiedPaymentIntentId = paymentIntentIdFromFd;
    } catch (err) {
      console.error("Failed to verify PaymentIntent:", err);
      return { error: "Could not verify your payment. Please try again or contact us." };
    }
  }

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
  // Signature is required only for two flows:
  //   - Remedial massage claimed via health fund (HICAPS audit trail)
  //   - Pregnancy massage (clinical-safety acknowledgement)
  // For HiCAPS claims it also embeds on the invoice PDF; pregnancy
  // signatures stay on the IntakeForm row as a safety consent record.
  const isPregnancyMassage = variant.service.slug === "pregnancy-massage";
  const isRemedialClaim =
    claimWithHealthFund && variant.service.slug === "remedial-massage";
  const signatureRequired = isRemedialClaim || isPregnancyMassage;
  if (signatureRequired) {
    if (
      !data.signatureDataUrl ||
      !data.signatureDataUrl.startsWith("data:image/png;base64,")
    ) {
      return {
        error: isRemedialClaim
          ? "Please sign in the signature pad to authorise the health fund claim."
          : "Please sign in the signature pad to acknowledge the pregnancy-massage safety information.",
      };
    }
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

  const startMinutes = sydneyMinuteOfDay(startsAt);
  const endMinutes = sydneyMinuteOfDay(endsAt);

  // Couple-booking validation. Resolve the partner variant up front because
  // the partner picks their own duration — that affects the conflict window
  // and the latest-end cap below.
  const isCouple = Boolean(data.partnerVariantId);
  if (isCouple && !nonEmpty(data.partnerName)) {
    return {
      error: "Please enter the partner’s name for the couple booking.",
    };
  }
  let partnerVariant: { id: string; durationMin: number; priceCents: number; serviceId: string; service: { name: string } } | null = null;
  let partnerEndsAt = endsAt;
  let partnerEndMinutes = endMinutes;
  if (isCouple && data.partnerVariantId) {
    const pv = await db.serviceVariant.findUnique({
      where: { id: data.partnerVariantId },
      include: { service: { select: { name: true } } },
    });
    if (!pv) return { error: "Partner service not found." };
    partnerVariant = pv;
    partnerEndsAt = addMinutes(startsAt, pv.durationMin);
    partnerEndMinutes = sydneyMinuteOfDay(partnerEndsAt);
  }

  // Clinic-wide policy: bookings must finish by 8:00 pm and start no
  // earlier than 9:00 am, regardless of per-therapist availability.
  // For couples we enforce the cap against whichever half ends later.
  const latestEndMinutes = Math.max(endMinutes, partnerEndMinutes);
  const widestEndsAt = endsAt > partnerEndsAt ? endsAt : partnerEndsAt;
  const sameDay =
    sydneyDateOf(startsAt) === sydneyDateOf(endsAt) &&
    sydneyDateOf(startsAt) === sydneyDateOf(partnerEndsAt);
  if (
    startMinutes < BOOKING_EARLIEST_START_MIN ||
    !sameDay ||
    latestEndMinutes > BOOKING_LATEST_END_MIN
  ) {
    const cap = `${Math.floor(BOOKING_LATEST_END_MIN / 60) % 12 || 12}:${String(BOOKING_LATEST_END_MIN % 60).padStart(2, "0")} pm`;
    return { error: `Sessions must finish by ${cap}. Please pick an earlier time.` };
  }

  // Find an available therapist for this slot.
  // Use Sydney day-of-week (matches getAvailableSlots) — startsAt.getDay()
  // returns the *server-local* (UTC on Vercel) dow, which is off-by-one for
  // early-morning Sydney times and rejects slots the picker said were OK.
  // Conflict window is widened to whichever half ends later so we don't miss
  // overlapping bookings on the longer-duration partner.
  const dow = sydneyDow(sydneyDateOf(startsAt));
  const therapists = await db.therapist.findMany({
    where: { active: true },
    include: {
      availability: { where: { dayOfWeek: dow } },
      bookings: {
        where: {
          status: { in: ["PENDING", "CONFIRMED"] },
          startsAt: { lt: widestEndsAt },
          endsAt: { gt: startsAt },
        },
      },
      timeOff: {
        where: { startsAt: { lt: widestEndsAt }, endsAt: { gt: startsAt } },
      },
    },
  });

  // A therapist is eligible for a given half if their availability window
  // covers that half's [start, end], with no booking or time-off conflicts.
  // Each half is checked against its own end so a partner with a longer or
  // shorter service is evaluated correctly.
  const eligibleFor = (
    halfEndMinutes: number,
    halfEndsAt: Date,
  ) =>
    therapists.filter(
      (t) =>
        t.availability.some(
          (a) => a.startMin <= startMinutes && a.endMin >= halfEndMinutes,
        ) &&
        !t.bookings.some(
          (b) => startsAt < b.endsAt && halfEndsAt > b.startsAt,
        ) &&
        !t.timeOff.some(
          (o) => startsAt < o.endsAt && halfEndsAt > o.startsAt,
        ),
    );

  const primaryEligible = eligibleFor(endMinutes, endsAt);

  let candidate: typeof therapists[number];
  let partnerCandidate: typeof therapists[number] | null = null;
  if (isCouple) {
    const partnerEligible = eligibleFor(partnerEndMinutes, partnerEndsAt);
    if (primaryEligible.length === 0 || partnerEligible.length === 0) {
      return {
        error:
          "Couple bookings need two free therapists at the same time. Please pick another time.",
      };
    }
    // Find any primary/partner pairing on distinct therapists.
    let pair: { p: typeof therapists[number]; pr: typeof therapists[number] } | null = null;
    outer: for (const p of primaryEligible) {
      for (const pr of partnerEligible) {
        if (pr.id !== p.id) {
          pair = { p, pr };
          break outer;
        }
      }
    }
    if (!pair) {
      return {
        error:
          "Couple bookings need two free therapists at the same time. Please pick another time.",
      };
    }
    candidate = pair.p;
    partnerCandidate = pair.pr;
  } else {
    if (primaryEligible.length === 0) {
      return { error: "That time was just taken — please pick another." };
    }
    candidate = primaryEligible[0];
  }

  // Phase 4 (slot model) — auto-assign the lowest-numbered active Slot
  // that has no time conflict. The slot label is denormalised onto the
  // booking so the customer-facing display stays stable even if the slot
  // is later renamed or deleted. Soft-fails: if no slot fits, the booking
  // still saves with slotId=null and downstream displays fall back to the
  // therapist name. This keeps the customer-flow risk near zero.
  let slotId: string | null = null;
  let slotLabel: string | null = null;
  // Partner half (couple bookings) gets the next-numbered slot
  let partnerSlotId: string | null = null;
  let partnerSlotLabel: string | null = null;
  try {
    // Per-day capacity override: if an admin has set a cap for this date,
    // restrict the candidate pool to the first N active slots by displayOrder.
    // No override = behave exactly as before (all active slots eligible).
    const sydneyDate = sydneyDateOf(startsAt);
    const override = await db.dailyCapacityOverride.findUnique({
      where: { date: sydneyDate },
    });

    // Resolve the allowed slot ID set when an override exists. An empty
    // array (override.maxActiveSlots === 0) correctly results in no slot
    // being assigned for the day.
    let allowedIds: string[] | null = null;
    if (override) {
      const allowedSlots = await db.slot.findMany({
        where: { active: true },
        select: { id: true },
        orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
        take: override.maxActiveSlots,
      });
      allowedIds = allowedSlots.map((s) => s.id);
    }

    const candidateSlots = await db.slot.findMany({
      where: {
        active: true,
        ...(allowedIds !== null ? { id: { in: allowedIds } } : {}),
        bookings: {
          none: {
            status: { in: ["PENDING", "CONFIRMED"] },
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
          },
        },
      },
      orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
      take: isCouple ? 2 : 1,
    });
    if (candidateSlots.length > 0) {
      slotId = candidateSlots[0].id;
      slotLabel = candidateSlots[0].label;
    }
    if (isCouple && candidateSlots.length > 1) {
      partnerSlotId = candidateSlots[1].id;
      partnerSlotLabel = candidateSlots[1].label;
    }
  } catch {
    // If the slot lookup throws (e.g. transient DB hiccup), proceed without
    // slot data rather than block the booking. A backfill task can populate
    // missing slot fields later.
    slotId = null;
    slotLabel = null;
  }

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
  // Persist fund details on the User row so they survive non-claim visits
  // and pre-fill cleanly next time. Only writes on claim submissions to
  // avoid blanking a previously-stored fund when the customer books a
  // non-claimable service (relaxation, etc.).
  if (claimWithHealthFund && data.healthFundName)
    userPatch.healthFundName = data.healthFundName;
  if (claimWithHealthFund && data.healthFundMemberNumber)
    userPatch.healthFundMemberNumber = data.healthFundMemberNumber;
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
      painLocationCodes: data.painLocationCodes ?? null,
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
      // Signature is captured on every booking as the per-visit consent
      // record. HiCAPS claims additionally embed it on the invoice PDF;
      // non-claim intakes keep it on the row only.
      signatureDataUrl: data.signatureDataUrl ?? null,
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
  // Couple bookings get a shared coupleGroupId so the two halves can be
  // linked for cancellation prompts, audit trails, and staff UI surfacing.
  const coupleGroupId =
    isCouple && partnerVariant && partnerCandidate ? crypto.randomUUID() : null;

  let bookingId: string;
  try {
    await db.$transaction(async (tx) => {
    const created = await tx.booking.create({
      data: {
        reference,
        clientId: clientUserId,
        serviceId: variant.serviceId,
        variantId: variant.id,
        therapistId: candidate.id,
        slotId,
        slotLabel,
        startsAt,
        endsAt,
        status: "CONFIRMED",
        priceCentsAtBooking: pricing.finalPriceCents,
        claimWithHealthFund,
        voucherCode,
        voucherAppliedCents,
        paidCents: voucherAppliedCents + verifiedDepositCents,
        notes: data.notes ?? null,
        coupleGroupId,
        paymentIntentId: verifiedPaymentIntentId,
      },
      select: { id: true },
    });
    bookingId = created.id;

    if (isCouple && partnerVariant && partnerCandidate) {
      const partnerNotes =
        (data.partnerName ? `Couple booking — partner: ${data.partnerName}` : "Couple booking — partner half") +
        (data.notes ? `\n\n${data.notes}` : "");
      await tx.booking.create({
        data: {
          reference: `${reference}-P`,
          clientId: clientUserId,
          serviceId: partnerVariant.serviceId,
          variantId: partnerVariant.id,
          therapistId: partnerCandidate.id,
          slotId: partnerSlotId,
          slotLabel: partnerSlotLabel,
          startsAt,
          // Partner picks their own duration, so this can differ from the
          // primary half's endsAt. The slot picker upstream and the per-half
          // therapist eligibility check above ensure both ends fit.
          endsAt: addMinutes(startsAt, partnerVariant.durationMin),
          status: "CONFIRMED",
          priceCentsAtBooking: partnerVariant.priceCents,
          claimWithHealthFund: false,
          // No voucher applied to the partner half — vouchers are tied to a
          // single booking reference.
          voucherCode: null,
          voucherAppliedCents: 0,
          paidCents: 0,
          notes: partnerNotes,
          coupleGroupId,
        },
      });
    }
  });
  } catch (err) {
    console.error("Booking transaction failed:", err);
    if (verifiedPaymentIntentId) {
      try {
        const stripeForRefund = getStripe();
        if (stripeForRefund) {
          await stripeForRefund.refunds.create({ payment_intent: verifiedPaymentIntentId });
          await audit({
            action: "stripe.refund.create",
            resource: verifiedPaymentIntentId,
            metadata: { reason: "booking_transaction_failed" },
          });
        }
      } catch (refundErr) {
        console.error("Refund failed after booking failure:", refundErr);
        await audit({
          action: "stripe.refund.failed",
          resource: verifiedPaymentIntentId,
          metadata: { error: String(refundErr) },
        });
      }
      return { error: "Booking could not be created. Your $30 deposit has been refunded (it may take a few minutes to show in your account). Please try again or contact us." };
    }
    return { error: "Booking could not be created. Please try again." };
  }

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
    resource: `Booking:${bookingId!}`,
    metadata: {
      reference,
      service: variant.service.name,
      guestCheckout: !session?.user,
      holidayName: pricing.holidayName,
      holidaySurchargeCents: pricing.surchargeCents,
    },
  });

  // Best-effort notification (never throws). Couple bookings include
  // partner info so the email and SMS list both halves and both references.
  await notifyBookingConfirmed({
    email: clientEmail,
    phone: clientPhone,
    name: clientName,
    reference,
    serviceName: variant.service.name,
    durationMin: variant.durationMin,
    startsAt,
    priceCents: pricing.finalPriceCents,
    partner:
      isCouple && partnerVariant
        ? {
            serviceName: partnerVariant.service.name,
            durationMin: partnerVariant.durationMin,
            priceCents: partnerVariant.priceCents,
            reference: `${reference}-P`,
            partnerName: data.partnerName ?? null,
          }
        : undefined,
  });

  return { ok: true, reference };
}
