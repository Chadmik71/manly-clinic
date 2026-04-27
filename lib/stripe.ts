// Lazy-loaded Stripe singleton. When STRIPE_SECRET_KEY is missing, the
// application transparently falls back to "pay in clinic" — no error.
import Stripe from "stripe";

let _stripe: Stripe | null | undefined;

export function getStripe(): Stripe | null {
  if (_stripe !== undefined) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    _stripe = null;
    return _stripe;
  }
  _stripe = new Stripe(key, { apiVersion: "2026-04-22.dahlia" });
  return _stripe;
}

export function stripeEnabled(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export function depositCents(priceCents: number): number {
  // 30% of the session price, rounded to the nearest dollar, minimum $20.
  const v = Math.round((priceCents * 0.3) / 100) * 100;
  return Math.max(2000, v);
}
