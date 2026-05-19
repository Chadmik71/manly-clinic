"use server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import {
  CANCEL_FEE_THRESHOLD_HOURS,
  CANCEL_FEE_PERCENT,
} from "@/lib/clinic";
import { notifyBookingCancelled } from "@/lib/notify";

import { getStripe } from "@/lib/stripe";

/// Refund-request eligibility threshold — strictly more than this many
/// hours between now and booking start. Mirrors the cancel-fee threshold
/// value today, but intentionally a separate constant because the two
/// rules can diverge (one gates fees, the other gates whether a request
/// can be submitted at all).
const REFUND_REQUEST_MIN_HOURS = 1;
export async function cancelBooking(
  id: string,
): Promise<{ ok?: boolean; error?: string; feeCents?: number }> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in required." };
  const b = await db.booking.findUnique({
    where: { id },
    include: { client: { select: { email: true, name: true, phone: true } } },
  });
  if (!b || b.clientId !== session.user.id) return { error: "Not found." };
  if (b.status === "CANCELLED") return { ok: true };

  const hoursUntil = (b.startsAt.getTime() - Date.now()) / 36e5;
  const feeCents =
    hoursUntil < CANCEL_FEE_THRESHOLD_HOURS
      ? Math.round((b.priceCentsAtBooking * CANCEL_FEE_PERCENT) / 100)
      : 0;

  await db.booking.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationFeeCents: feeCents,
    },
  });
  await audit({
    userId: session.user.id,
    action: "CANCEL_BOOKING",
    resource: `Booking:${id}`,
    metadata: { feeCents, hoursUntil: Math.round(hoursUntil) },
  });
  if (b.paymentIntentId && feeCents === 0) {
    try {
      const stripe = getStripe();
      if (stripe) {
        await stripe.refunds.create({ payment_intent: b.paymentIntentId });
        await audit({
          userId: session.user.id,
          action: "stripe.refund.create",
          resource: b.paymentIntentId,
          metadata: { reason: "booking_cancelled_in_policy", bookingId: id },
        });
      }
    } catch (refundErr) {
      console.error("Refund failed on cancellation:", refundErr);
      await audit({
        userId: session.user.id,
        action: "stripe.refund.failed",
        resource: b.paymentIntentId,
        metadata: { error: String(refundErr), bookingId: id },
      });
    }
  }
  await notifyBookingCancelled({
    email: b.client.email,
    phone: b.client.phone,
    name: b.client.name,
    reference: b.reference,
    startsAt: b.startsAt,
    feeCents,
  });
  revalidatePath("/portal/bookings");
  revalidatePath("/portal");
  return { ok: true, feeCents };
}

/**
 * Submit a refund request for an upcoming, paid booking. Goes onto a queue
 * that an admin reviews; no money moves until the admin approves. Gates:
 *
 *   - caller owns the booking
 *   - booking status is CONFIRMED or PENDING (not already cancelled/done)
 *   - more than 1 hour until booking start
 *   - booking has a Stripe PaymentIntent and paidCents > 0
 *   - no existing OPEN request (REQUESTED or APPROVED) on this booking
 *
 * A previously DECLINED, PROCESSED, or FAILED request does not block a new
 * submission — re-requesting after a decline is allowed.
 */
export async function requestRefund(
  bookingId: string,
  reason: string | null,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in required." };

  const trimmed = reason?.trim() ?? "";
  if (trimmed.length > 500) {
    return { error: "Reason must be 500 characters or fewer." };
  }

  const b = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      clientId: true,
      status: true,
      startsAt: true,
      paymentIntentId: true,
      paidCents: true,
    },
  });
  if (!b || b.clientId !== session.user.id) return { error: "Not found." };

  if (b.status === "CANCELLED" || b.status === "COMPLETED" || b.status === "NO_SHOW") {
    return { error: "This booking can no longer be refunded." };
  }
  const hoursUntil = (b.startsAt.getTime() - Date.now()) / 36e5;
  if (hoursUntil <= REFUND_REQUEST_MIN_HOURS) {
    return {
      error: `Refund requests must be submitted more than ${REFUND_REQUEST_MIN_HOURS} hour before the booking starts.`,
    };
  }
  if (!b.paymentIntentId || b.paidCents <= 0) {
    return { error: "This booking has no card payment to refund." };
  }

  // Check-then-insert in a transaction. Prisma can't express a partial
  // unique index ("one open request per booking"), so we serialise the
  // check and the create together. Worst-case a race produces two open
  // rows — the approve action also checks before moving money.
  try {
    await db.$transaction(async (tx) => {
      const existing = await tx.refundRequest.findFirst({
        where: {
          bookingId: b.id,
          status: { in: ["REQUESTED", "APPROVED"] },
        },
        select: { id: true },
      });
      if (existing) {
        throw new Error("ALREADY_OPEN");
      }
      await tx.refundRequest.create({
        data: {
          bookingId: b.id,
          reason: trimmed.length > 0 ? trimmed : null,
          amountCents: b.paidCents,
          status: "REQUESTED",
        },
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_OPEN") {
      return { error: "A refund request is already open for this booking." };
    }
    console.error("requestRefund failed:", err);
    return { error: "Could not submit the request. Please try again." };
  }

  await audit({
    userId: session.user.id,
    action: "REFUND_REQUEST_CREATE",
    resource: `Booking:${b.id}`,
    metadata: {
      amountCents: b.paidCents,
      hasReason: trimmed.length > 0,
      hoursUntil: Math.round(hoursUntil),
    },
  });

  revalidatePath("/portal/bookings");
  revalidatePath("/portal");
  revalidatePath("/staff/refunds");
  return { ok: true };
}
