import { NextResponse } from "next/server";
import { headers } from "next/headers";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { withDbRetry } from "@/lib/db-retry";
import { getStripe, stripeEnabled } from "@/lib/stripe";

export const config = { api: { bodyParser: false } };

export async function POST(req: Request) {
  if (!stripeEnabled())
    return NextResponse.json({ error: "not configured" }, { status: 501 });
  const stripe = getStripe()!;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret)
    return NextResponse.json({ error: "no webhook secret" }, { status: 500 });
  const sig = (await headers()).get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "missing sig" }, { status: 400 });

  const raw = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (e) {
    return NextResponse.json({ error: `Bad sig: ${(e as Error).message}` }, { status: 400 });
  }

  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object;
    const bookingId = pi.metadata?.bookingId;
    if (bookingId) {
      const amount = pi.amount_received ?? pi.amount;
      await db.booking.update({
        where: { id: bookingId },
        data: { paidCents: { increment: amount } },
      });
      await audit({
        userId: pi.metadata?.userId ?? null,
        action: "DEPOSIT_PAID",
        resource: `Booking:${bookingId}`,
        metadata: { paymentIntentId: pi.id, amount },
      });
    }
  }

  if (event.type === "charge.refunded") {
    const charge = event.data.object as Stripe.Charge;
    const piId =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id ?? null;
    if (piId) {
      // Stripe sends one charge.refunded event per refund operation;
      // event.data.previous_attributes carries the pre-event
      // amount_refunded, so subtracting gives the amount THIS refund moved.
      // Falling back to 0 when previous_attributes is absent (rare;
      // happens on first-and-only refund without a prior history).
      const prev = (
        event.data as { previous_attributes?: { amount_refunded?: number } }
      ).previous_attributes;
      const newTotal = charge.amount_refunded ?? 0;
      const oldTotal = prev?.amount_refunded ?? 0;
      const delta = newTotal - oldTotal;

      if (delta > 0) {
        // Look up booking by PaymentIntent id (the link is stored on
        // Booking.paymentIntentId at creation time, after createBooking
        // verifies the PI succeeded). Wrapped in withDbRetry to survive
        // Neon's idle-suspend cold starts — webhooks fire on customer
        // refund actions, which often follow long idle periods.
        const booking = await withDbRetry(() =>
          db.booking.findFirst({
            where: { paymentIntentId: piId },
            select: { id: true },
          }),
        );

        if (booking) {
          await withDbRetry(() =>
            db.booking.update({
              where: { id: booking.id },
              data: { paidCents: { decrement: delta } },
            }),
          );
          await audit({
            action: "REFUND_RECEIVED",
            resource: `Booking:${booking.id}`,
            metadata: {
              eventId: event.id,
              chargeId: charge.id,
              paymentIntentId: piId,
              refundDeltaCents: delta,
              cumulativeRefundedCents: newTotal,
            },
          });
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
