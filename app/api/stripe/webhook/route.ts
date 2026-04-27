import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
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

  return NextResponse.json({ received: true });
}
