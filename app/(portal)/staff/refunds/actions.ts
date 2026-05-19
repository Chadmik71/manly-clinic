"use server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { getStripe, stripeEnabled } from "@/lib/stripe";
import { notifyRefundDecided } from "@/lib/notify";

// Refunds move real money. Admin-only, defense-in-depth: the /staff/refunds
// page redirects non-admins, but server actions are reachable independent of
// the route guard.
async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") return null;
  return session;
}

const REFUND_REQUEST_MIN_HOURS = 1;

/**
 * Approve a pending refund request, fire the Stripe refund, and cancel the
 * underlying booking. Re-checks all eligibility gates before moving money
 * because the request may have aged past the 1-hour cutoff while sitting
 * in the queue.
 *
 * Status transitions:
 *   REQUESTED → APPROVED → PROCESSED   (Stripe call succeeded)
 *                       └→ FAILED       (Stripe call threw — terminal; admin
 *                                        must refund manually via the Stripe
 *                                        dashboard. Booking is NOT cancelled
 *                                        in this branch so admin can decide.)
 *
 * On PROCESSED the booking is set CANCELLED with cancellationFeeCents=0.
 * The webhook handler decrements Booking.paidCents when the charge.refunded
 * event arrives — same path as every other refund.
 */
export async function approveRefund(
  requestId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireAdmin();
  if (!session) return { error: "Forbidden." };
  if (!stripeEnabled()) return { error: "Stripe is not configured." };

  const req = await db.refundRequest.findUnique({
    where: { id: requestId },
    include: {
      booking: {
        include: {
          client: { select: { id: true, email: true, name: true, phone: true } },
        },
      },
    },
  });
  if (!req) return { error: "Refund request not found." };
  if (req.status !== "REQUESTED") {
    return { error: `Request is already ${req.status.toLowerCase()}.` };
  }

  const b = req.booking;
  const hoursUntil = (b.startsAt.getTime() - Date.now()) / 36e5;
  if (hoursUntil <= REFUND_REQUEST_MIN_HOURS) {
    return {
      error: `Booking is now within ${REFUND_REQUEST_MIN_HOURS} hour of start — refund is no longer eligible. Decline the request instead.`,
    };
  }
  if (b.status === "CANCELLED" || b.status === "COMPLETED" || b.status === "NO_SHOW") {
    return { error: `Booking is ${b.status.toLowerCase()} — cannot refund.` };
  }
  if (!b.paymentIntentId || b.paidCents <= 0) {
    return { error: "Booking has no card payment to refund." };
  }

  // Move to APPROVED first so the row reflects intent even if the Stripe
  // call hangs or this process dies mid-flight.
  await db.refundRequest.update({
    where: { id: req.id },
    data: {
      status: "APPROVED",
      decidedAt: new Date(),
      decidedById: session.user.id,
      decidedByName: session.user.name ?? null,
    },
  });
  await audit({
    userId: session.user.id,
    action: "REFUND_REQUEST_APPROVE",
    resource: `RefundRequest:${req.id}`,
    metadata: {
      bookingId: b.id,
      amountCents: req.amountCents,
    },
  });

  const stripe = getStripe()!;
  let refundId: string | null = null;
  let refundErr: unknown = null;
  try {
    const refund = await stripe.refunds.create({
      payment_intent: b.paymentIntentId,
    });
    refundId = refund.id;
  } catch (err) {
    refundErr = err;
  }

  if (refundErr) {
    await db.refundRequest.update({
      where: { id: req.id },
      data: {
        status: "FAILED",
        stripeError: String(refundErr).slice(0, 1000),
      },
    });
    await audit({
      userId: session.user.id,
      action: "stripe.refund.failed",
      resource: b.paymentIntentId,
      metadata: {
        refundRequestId: req.id,
        bookingId: b.id,
        error: String(refundErr).slice(0, 500),
      },
    });
    await notifyRefundDecided({
      email: b.client.email,
      name: b.client.name,
      reference: b.reference,
      startsAt: b.startsAt,
      amountCents: req.amountCents,
      decision: "FAILED",
      declineReason: null,
    });
    revalidatePath("/staff/refunds");
    return {
      error:
        "Stripe refund failed. Request marked FAILED — refund manually via the Stripe dashboard. Client notified.",
    };
  }

  // Stripe call succeeded. Mark PROCESSED, cancel the booking, notify.
  // paidCents stays untouched here — the existing charge.refunded webhook
  // handler will decrement it when Stripe delivers the event.
  await db.$transaction([
    db.refundRequest.update({
      where: { id: req.id },
      data: { status: "PROCESSED", stripeRefundId: refundId },
    }),
    db.booking.update({
      where: { id: b.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationFeeCents: 0,
      },
    }),
  ]);
  await audit({
    userId: session.user.id,
    action: "stripe.refund.create",
    resource: b.paymentIntentId,
    metadata: {
      refundRequestId: req.id,
      bookingId: b.id,
      refundId,
      reason: "refund_request_approved",
    },
  });
  await notifyRefundDecided({
    email: b.client.email,
    name: b.client.name,
    reference: b.reference,
    startsAt: b.startsAt,
    amountCents: req.amountCents,
    decision: "APPROVED",
    declineReason: null,
  });

  revalidatePath("/staff/refunds");
  revalidatePath("/portal/bookings");
  return { ok: true };
}

export async function declineRefund(
  requestId: string,
  declineReason: string | null,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireAdmin();
  if (!session) return { error: "Forbidden." };

  const trimmed = declineReason?.trim() ?? "";
  if (trimmed.length > 500) {
    return { error: "Reason must be 500 characters or fewer." };
  }

  const req = await db.refundRequest.findUnique({
    where: { id: requestId },
    include: {
      booking: {
        select: {
          reference: true,
          startsAt: true,
          client: { select: { email: true, name: true } },
        },
      },
    },
  });
  if (!req) return { error: "Refund request not found." };
  if (req.status !== "REQUESTED") {
    return { error: `Request is already ${req.status.toLowerCase()}.` };
  }

  await db.refundRequest.update({
    where: { id: req.id },
    data: {
      status: "DECLINED",
      decidedAt: new Date(),
      decidedById: session.user.id,
      decidedByName: session.user.name ?? null,
      declineReason: trimmed.length > 0 ? trimmed : null,
    },
  });
  await audit({
    userId: session.user.id,
    action: "REFUND_REQUEST_DECLINE",
    resource: `RefundRequest:${req.id}`,
    metadata: {
      bookingId: req.bookingId,
      hasReason: trimmed.length > 0,
    },
  });
  await notifyRefundDecided({
    email: req.booking.client.email,
    name: req.booking.client.name,
    reference: req.booking.reference,
    startsAt: req.booking.startsAt,
    amountCents: req.amountCents,
    decision: "DECLINED",
    declineReason: trimmed.length > 0 ? trimmed : null,
  });

  revalidatePath("/staff/refunds");
  revalidatePath("/portal/bookings");
  return { ok: true };
}
