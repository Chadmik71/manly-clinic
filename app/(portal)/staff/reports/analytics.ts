// Pure compute helpers for the staff Reports page. No DB access here — the
// page fetches rows and hands them in. Kept Sydney-TZ aware via lib/time so
// day-of-week / hour binning matches what staff actually see on the calendar.

import { SYDNEY_TZ, sydneyDateOf, sydneyDow } from "@/lib/time";

// Mon-first day order for display. Index 0 = Monday … 6 = Sunday.
export const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DOW_LABELS_LONG = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// JS getDay() is Sun=0..Sat=6. Convert to our Mon-first index (Mon=0..Sun=6).
function monFirstIndex(jsDow: number): number {
  return (jsDow + 6) % 7;
}

/** Sydney clock hour (0-23) and Mon-first weekday index for a UTC instant. */
function sydneyHourAndDow(d: Date): { hour: number; dowMon: number } {
  const hourStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: SYDNEY_TZ,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(d);
  const hour = Number(hourStr);
  const jsDow = sydneyDow(sydneyDateOf(d)); // Sun=0..Sat=6
  return { hour, dowMon: monFirstIndex(jsDow) };
}

export type Heatmap = {
  /** grid[dowMon][hourIndex] = booking count */
  grid: number[][];
  hours: number[];
  maxCount: number;
  /** Busiest weekday (Mon-first index) by total count, or null if no data. */
  busiestDowMon: number | null;
  busiestHour: number | null;
};

/**
 * Bin bookings into a weekday x hour heatmap. Cancelled bookings are excluded
 * (they never occupied the chair); everything else counts toward "how busy".
 * Hour columns are clamped to the clinic's operating window but auto-widen to
 * include any out-of-hours bookings in the data.
 */
export function buildHeatmap(
  bookings: { startsAt: Date; status: string }[],
  openHour = 9,
  closeHour = 20,
): Heatmap {
  const counted = bookings.filter((b) => b.status !== "CANCELLED");
  let minH = openHour;
  let maxH = closeHour;
  const cells: { hour: number; dowMon: number }[] = [];
  for (const b of counted) {
    const { hour, dowMon } = sydneyHourAndDow(b.startsAt);
    cells.push({ hour, dowMon });
    if (hour < minH) minH = hour;
    if (hour > maxH) maxH = hour;
  }
  const hours: number[] = [];
  for (let h = minH; h <= maxH; h++) hours.push(h);
  const hourIndex = new Map(hours.map((h, i) => [h, i]));

  const grid: number[][] = Array.from({ length: 7 }, () =>
    new Array(hours.length).fill(0),
  );
  const dowTotals = new Array(7).fill(0);
  const hourTotals = new Array(hours.length).fill(0);
  for (const c of cells) {
    const hi = hourIndex.get(c.hour);
    if (hi === undefined) continue;
    grid[c.dowMon][hi] += 1;
    dowTotals[c.dowMon] += 1;
    hourTotals[hi] += 1;
  }
  const maxCount = Math.max(0, ...grid.flat());
  const busiestDowMon = maxCount === 0 ? null : dowTotals.indexOf(Math.max(...dowTotals));
  const busiestHourIdx = maxCount === 0 ? -1 : hourTotals.indexOf(Math.max(...hourTotals));
  const busiestHour = busiestHourIdx === -1 ? null : hours[busiestHourIdx];

  return { grid, hours, maxCount, busiestDowMon, busiestHour };
}

/** Format a 24h clock hour as a short label, e.g. 9 -> "9a", 13 -> "1p". */
export function hourShort(h: number): string {
  if (h === 0) return "12a";
  if (h === 12) return "12p";
  return h < 12 ? `${h}a` : `${h - 12}p`;
}

/**
 * Every Sydney calendar date (YYYY-MM-DD) from fromISO to toISO inclusive.
 * Samples each UTC day at noon so the Sydney calendar date never slips across
 * a DST boundary. Capped at ~13 months so a pathological range can't loop
 * unbounded.
 */
export function eachSydneyDate(fromISO: string, toISO: string): string[] {
  const [y, m, d] = fromISO.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < 400; i++) {
    const iso = sydneyDateOf(new Date(Date.UTC(y, m - 1, d + i, 12)));
    if (iso > toISO) break;
    out.push(iso);
  }
  return out;
}

/**
 * Available working minutes for one therapist across a date range, given
 * their weekly availability (minutes per Sun=0..Sat=6 weekday) minus time-off
 * that overlaps the range. The time-off subtraction is range-clamped (not
 * intersected with each day's working window) — close enough for an
 * at-a-glance capacity read and never produces a negative.
 */
export function availableMinutes(
  fromISO: string,
  toISO: string,
  fromDate: Date,
  toDate: Date,
  minutesByJsDow: Map<number, number>,
  timeOff: { startsAt: Date; endsAt: Date }[],
): number {
  let total = 0;
  for (const iso of eachSydneyDate(fromISO, toISO)) {
    total += minutesByJsDow.get(sydneyDow(iso)) ?? 0;
  }
  let offMin = 0;
  for (const o of timeOff) {
    const start = Math.max(o.startsAt.getTime(), fromDate.getTime());
    const end = Math.min(o.endsAt.getTime(), toDate.getTime());
    if (end > start) offMin += (end - start) / 60000;
  }
  return Math.max(0, total - offMin);
}
