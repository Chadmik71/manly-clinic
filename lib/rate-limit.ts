// Simple in-memory rate limiter.
//
// Vercel runs Next.js server actions and API routes in serverless functions
// which may be re-used across requests (warm) or be a cold start. The Map below
// lives in the function instance memory, so:
//   - Within a warm instance, repeat callers ARE counted across requests.
//   - A new cold instance starts with an empty Map (rate limit "reset").
//
// For a small clinic with low traffic this is plenty to deter casual abuse:
//   * stops scripted card-testing against the deposit endpoint
//   * stops repeated signup spam from one IP
//   * stops accidental client-side retry loops
//
// For production-grade abuse protection (DDoS-level), pair this with Vercel's
// platform-level WAF / firewall rules or move to Upstash Redis.

type Bucket = {
  count: number;
  resetAt: number; // epoch ms
};

const buckets = new Map<string, Bucket>();

// Periodically prune expired buckets so memory does not grow unbounded.
// Runs at most once per minute.
let lastPruneAt = 0;
function pruneIfNeeded(now: number) {
  if (now - lastPruneAt < 60_000) return;
  lastPruneAt = now;
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Best-effort client IP extraction from a Request.
 * Vercel sets x-forwarded-for; falls back to x-real-ip; final fallback "unknown".
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    // x-forwarded-for can be a comma-separated list; first entry is the client.
    return xff.split(",")[0].trim();
  }
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms when the window resets
  retryAfterSec: number; // seconds until the window resets (0 if allowed)
};

/**
 * Fixed-window rate limit.
 *
 * @param key       Unique key (typically "<endpoint>:<ip>")
 * @param limit     Max requests in the window
 * @param windowMs  Window size in milliseconds
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  pruneIfNeeded(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    // Start a new window.
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt, retryAfterSec: 0 };
  }

  if (existing.count >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
      retryAfterSec,
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: limit - existing.count,
    resetAt: existing.resetAt,
    retryAfterSec: 0,
  };
}

/**
 * Helper that builds a standard 429 JSON Response with Retry-After header.
 * Import NextResponse at the call site if you want to use that instead.
 */
export function rateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please try again shortly.",
      retryAfterSec: result.retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(result.retryAfterSec),
      },
    },
  );
}

// Sensible defaults per endpoint type.
// Tune later if real traffic suggests otherwise.
export const RATE_LIMITS = {
  // Stripe PaymentIntent creation: someone testing stolen cards would hit this hard.
  paymentIntent: { limit: 10, windowMs: 60_000 }, // 10/min per IP
  // Deposit refund (authenticated, lower risk but still public-ish).
  depositRefund: { limit: 20, windowMs: 60_000 }, // 20/min per IP
  // Signup: prevent account-creation spam.
  signup: { limit: 5, windowMs: 60_000 }, // 5/min per IP
} as const;
