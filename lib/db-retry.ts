/**
 * Wrap a Prisma call so it survives Neon's auto-suspend cold start. Neon's
 * free tier suspends idle compute after ~5 min, and the first request after
 * that often blows past the connection timeout — Prisma throws
 * `PrismaClientInitializationError: Can't reach database server …`.
 * Cron jobs that fire every 15–30 min almost always hit this.
 *
 * Retries up to `maxAttempts` times with 500ms / 1s / 2s backoff. Re-throws
 * the error immediately if it's not a connection failure (so logic bugs
 * still surface fast), and re-throws after the final attempt if every retry
 * was a connection failure.
 *
 * Detection is by error.name + a message regex rather than `instanceof
 * Prisma.PrismaClientInitializationError`, because that class lives under
 * `@prisma/client/runtime/library` and importing from there couples to
 * Prisma internals we'd rather not pin.
 */

function isConnectionError(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  if (e.name === "PrismaClientInitializationError") return true;
  return /Can't reach database|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|connection (?:closed|terminated|reset)|server closed the connection|Engine is not yet connected/i.test(
    e.message,
  );
}

const BACKOFF_MS = [500, 1_000, 2_000];

export async function withDbRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (!isConnectionError(e)) throw e;
      if (attempt === maxAttempts - 1) break;
      const delay = BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
