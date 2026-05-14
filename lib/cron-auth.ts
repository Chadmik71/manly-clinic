import { NextResponse } from "next/server";

/**
 * Gatekeeper for /api/cron/* routes. Returns null when the request is
 * authorised, or a NextResponse to short-circuit the handler.
 *
 * Accepts either:
 *   - `Authorization: Bearer <CRON_SECRET>` header (Vercel Cron injects this
 *     automatically when CRON_SECRET is set as an env var)
 *   - `?secret=<CRON_SECRET>` query param (legacy; useful for manual curl
 *     and external schedulers like GitHub Actions)
 *
 * Fail-closed: if CRON_SECRET is not set in the environment, every request
 * is rejected. The previous behaviour of "skip auth when secret is unset"
 * left prod endpoints open to the internet, which let anyone fire
 * customer-facing reminders and audit-flip past bookings.
 */
export function requireCronAuth(req: Request): NextResponse | null {
  // .trim() defends against the all-too-common trailing-newline bite when
  // an operator pastes the secret into a dashboard textarea — Vercel,
  // GitHub Secrets, and most env-var UIs will happily store the \n.
  // Trimming both the stored value and the request-supplied value keeps
  // verification working in that case without a redeploy.
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }

  const authHeader = (req.headers.get("authorization") ?? "").trim();
  if (authHeader === `Bearer ${expected}`) return null;

  const url = new URL(req.url);
  const querySecret = (url.searchParams.get("secret") ?? "").trim();
  if (querySecret === expected) return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
