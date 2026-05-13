// POST /api/bookings/payment-intent
//
// Creates a Stripe PaymentIntent for a booking deposit BEFORE the booking
// itself is created. Returns clientSecret and paymentIntentId so the client
// can collect the deposit via Stripe Elements. After the customer's payment
// succeeds, the client calls createBooking (server action) with the
// paymentIntentId attached; createBooking then verifies the PaymentIntent
// is "succeeded" before writing the booking row to the database.
//
// This route does NOT require authentication — guests can also pay deposits.
// Security model: the PaymentIntent only authorises a fixed AUD amount
// (depositCents()), so even if the endpoint is hit maliciously, the worst
// case is creating orphan PaymentIntents which Stripe expires automatically.
//
// The route is gated by depositsEnabled() — when the feature flag is off,
// it returns 503 and the client falls back to the current "no deposit" flow.

import { NextResponse } from "next/server";
import {
  getStripe,
  depositCents,
  depositsEnabled,
} from "@/lib/stripe";
import { audit } from "@/lib/audit";
import { rateLimit, rateLimitResponse, getClientIp, RATE_LIMITS } from "@/lib/rate-limit";
import { getClinicSettings, computeCardSurchargeCents } from "@/lib/clinic-settings";

export async function POST(req: Request) {
  // Rate limit: prevent card-testing / abuse on this public endpoint.
  const ip = getClientIp(req);
  const rl = rateLimit(
    `payment-intent:${ip}`,
    RATE_LIMITS.paymentIntent.limit,
    RATE_LIMITS.paymentIntent.windowMs,
  );
  if (!rl.allowed) return rateLimitResponse(rl);
  if (!depositsEnabled()) {
    return NextResponse.json(
      { error: "Deposits are not currently enabled." },
      { status: 503 },
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Payment processing is temporarily unavailable." },
      { status: 503 },
    );
  }

  let body: {
    email?: string;
    name?: string;
    serviceName?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    // Empty/invalid JSON body is fine — we don't strictly need anything.
  }

  // Read DB-backed clinic settings. We deliberately do NOT swallow errors here:
  // if the DB is unreachable we want the request to fail rather than risk
  // charging the wrong amount.
  const settings = await getClinicSettings();
  if (!settings.depositsEnabled) {
    return NextResponse.json(
      { error: "Deposits are not currently enabled." },
      { status: 503 },
    );
  }

  const baseDepositCents = depositCents();
  const surchargeCents = computeCardSurchargeCents(baseDepositCents, settings);
  const amountCents = baseDepositCents + surchargeCents;

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "aud",
      payment_method_types: ["card"],
      description:
        `Manly Remedial Thai — booking deposit` +
        (body.serviceName ? ` (${body.serviceName})` : ""),
      metadata: {
        kind: "booking_deposit",
        customerEmail: body.email ?? "",
        customerName: body.name ?? "",
        serviceName: body.serviceName ?? "",
      },
    });

    await audit({
      action: "stripe.payment_intent.create",
      resource: paymentIntent.id,
      metadata: {
        amountCents,
        kind: "booking_deposit",
        email: body.email ?? null,
      },
    });

    return NextResponse.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountCents,
      baseDepositCents,
      surchargeCents,
      surchargeBps: settings.cardSurchargeEnabled ? settings.cardSurchargeBps : 0,
    });
  } catch (err) {
    console.error("payment-intent: failed to create", err);
    return NextResponse.json(
      { error: "Could not start payment. Please try again." },
      { status: 500 },
    );
  }
}
