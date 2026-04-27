import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getStripe, depositCents, stripeEnabled } from "@/lib/stripe";

// Creates a Stripe Payment Intent for a deposit on the given booking.
// Returns { clientSecret, amountCents }. If Stripe is not configured,
// returns 501 so the UI can show a "pay in clinic" message instead.
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!stripeEnabled())
    return NextResponse.json(
      { error: "Online payments are not configured. Please pay in clinic." },
      { status: 501 },
    );

  const { id } = await params;
  const b = await db.booking.findUnique({ where: { id } });
  if (!b || b.clientId !== session.user.id)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (b.paidCents >= b.priceCentsAtBooking)
    return NextResponse.json({ error: "Already paid in full." }, { status: 400 });

  const amount = depositCents(b.priceCentsAtBooking);
  const stripe = getStripe()!;
  const intent = await stripe.paymentIntents.create({
    amount,
    currency: "aud",
    automatic_payment_methods: { enabled: true },
    metadata: {
      bookingId: b.id,
      reference: b.reference,
      userId: session.user.id,
    },
  });

  await db.booking.update({
    where: { id: b.id },
    data: { paymentIntentId: intent.id },
  });
  await audit({
    userId: session.user.id,
    action: "DEPOSIT_INTENT_CREATED",
    resource: `Booking:${b.id}`,
    metadata: { amountCents: amount },
  });

  return NextResponse.json({
    clientSecret: intent.client_secret,
    amountCents: amount,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
  });
}
