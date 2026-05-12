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

export function depositCents(_priceCents?: number): number {
  // Flat deposit in cents. Configurable via DEPOSIT_CENTS env var.
  // Defaults to $30 (3000 cents). The _priceCents parameter is kept for
  // backward compatibility with earlier scaffolding and is ignored.
  const fromEnv = Number(process.env.DEPOSIT_CENTS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return Math.round(fromEnv);
  return 3000;
}

export function depositsEnabled(): boolean {
  // Both conditions must be true:
  //   1. Stripe SDK is configured (STRIPE_SECRET_KEY is set)
  //   2. NEXT_PUBLIC_DEPOSITS_ENABLED env var equals "true"
  // The second flag is the kill switch: even if Stripe keys are set,
  // the deposit UI stays hidden until this is explicitly flipped on.
  return stripeEnabled() && process.env.NEXT_PUBLIC_DEPOSITS_ENABLED === "true";
}
