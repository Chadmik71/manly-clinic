// Sydney timezone helpers.
//
// We use the built-in Intl API rather than pulling in `date-fns-tz` so we
// don't add another peer-dep that could clash with NextAuth/Next.
//
// The clinic operates in Australia/Sydney. The Vercel runtime is UTC.
// All "Sydney calendar day" math must therefore be explicit.

export const SYDNEY_TZ = "Australia/Sydney";

/** Sydney calendar date (YYYY-MM-DD) for the given UTC instant. */
export function sydneyDateOf(at: Date = new Date()): string {
  // 'en-CA' formats Y-M-D with hyphens.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SYDNEY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Today's Sydney calendar date (YYYY-MM-DD). */
export function sydneyTodayISO(): string {
  return sydneyDateOf(new Date());
}

/**
 * For a Sydney calendar date (YYYY-MM-DD), return the UTC instants that
 * mark the start (Sydney midnight) and end (next Sydney midnight) of that
 * day. DST-safe: the day length will correctly be 23 or 25 hours on the
 * two days each year that AEST/AEDT switches over.
 */
export function sydneyDayBoundsUtc(dateISO: string): {
  start: Date;
  end: Date;
} {
  const [y, m, d] = dateISO.split("-").map(Number);
  const start = sydneyWallToUtc(y, m, d, 0, 0);
  const end = sydneyWallToUtc(y, m, d + 1, 0, 0); // next-day midnight (Date handles overflow)
  return { start, end };
}

/** Day of week (0=Sunday … 6=Saturday) for the given Sydney calendar day. */
export function sydneyDow(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  // Sample at noon to stay clear of any DST-transition midnight ambiguity.
  const utc = sydneyWallToUtc(y, m, d, 12, 0);
  const wd = new Intl.DateTimeFormat("en-US", {
    timeZone: SYDNEY_TZ,
    weekday: "short",
  }).format(utc);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(wd);
}

/**
 * Long Sydney calendar date for human display.
 * e.g. "Tuesday 28 April 2026"
 */
export function sydneyDateLong(at: Date): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: SYDNEY_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(at);
}

/**
 * Short Sydney clock time for human display.
 * e.g. "5:00 PM" (matches date-fns "h:mm a" but always Sydney-local).
 */
export function sydneyTimeShort(at: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: SYDNEY_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(at);
}

/** Convert Sydney wall-clock components into the equivalent UTC Date. DST-safe. */
function sydneyWallToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  // 1) Construct the wall time as if Sydney were UTC.
  const naiveUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
  // 2) Find Sydney's UTC offset at that naive instant. Off by at most one
  //    hour around DST transitions; we correct for that in step 3.
  let offsetMs = sydneyOffsetMs(new Date(naiveUtcMs));
  // 3) Re-evaluate the offset at the candidate true instant.
  offsetMs = sydneyOffsetMs(new Date(naiveUtcMs - offsetMs));
  return new Date(naiveUtcMs - offsetMs);
}

/** Sydney UTC offset (in ms) at the given UTC instant. e.g. +10h or +11h DST. */
function sydneyOffsetMs(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SYDNEY_TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  const sydneyMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return sydneyMs - at.getTime();
}
