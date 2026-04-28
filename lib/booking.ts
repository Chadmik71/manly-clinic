import { db } from "@/lib/db";
import { addMinutes } from "date-fns";
import {
  BOOKING_LATEST_END_MIN,
  BOOKING_EARLIEST_START_MIN,
} from "@/lib/clinic";
import {
  sydneyDateOf,
  sydneyDayBoundsUtc,
  sydneyDow,
} from "@/lib/time";

export type Slot = { startsAt: Date; endsAt: Date; therapistId: string };

/**
 * Compute available slots for a given service variant on a specific Sydney
 * calendar day, across all active therapists. Returns 15-minute aligned
 * slots that fit within at least one therapist's availability and don't
 * overlap existing bookings or time-off. Sessions must end by
 * BOOKING_LATEST_END_MIN.
 *
 * params.date is treated as "any instant on the desired Sydney day" — we
 * derive the YYYY-MM-DD in Australia/Sydney from it. This is robust whether
 * the caller passes `new Date()` (now) or `new Date('2026-04-29')` (UTC
 * midnight = 10am Sydney = still 29 Apr in Sydney).
 */
export async function getAvailableSlots(params: {
  date: Date;
  durationMin: number;
  therapistId?: string;
  stepMin?: number;
}): Promise<Slot[]> {
  const step = params.stepMin ?? 15;

  // Sydney calendar day is the source of truth.
  const dateISO = sydneyDateOf(params.date);
  const { start: dayStart, end: dayEnd } = sydneyDayBoundsUtc(dateISO);
  const dow = sydneyDow(dateISO);

  const therapists = await db.therapist.findMany({
    where: {
      active: true,
      ...(params.therapistId ? { id: params.therapistId } : {}),
    },
    include: {
      availability: { where: { dayOfWeek: dow } },
      timeOff: {
        where: { startsAt: { lte: dayEnd }, endsAt: { gte: dayStart } },
      },
      bookings: {
        where: {
          startsAt: { gte: dayStart, lte: dayEnd },
          status: { in: ["PENDING", "CONFIRMED"] },
        },
      },
    },
  });

  const slots: Slot[] = [];
  const now = new Date();

  for (const t of therapists) {
    for (const a of t.availability) {
      // Clamp to clinic-wide policy: earliest start, latest end.
      const earliestStart = Math.max(a.startMin, BOOKING_EARLIEST_START_MIN);
      const latestEnd = Math.min(a.endMin, BOOKING_LATEST_END_MIN);
      const lastStartMin = latestEnd - params.durationMin;
      if (lastStartMin < earliestStart) continue; // duration doesn't fit

      const startCandidate = addMinutes(dayStart, earliestStart);
      const lastValidStart = addMinutes(dayStart, lastStartMin);

      for (
        let cur = startCandidate;
        cur <= lastValidStart;
        cur = addMinutes(cur, step)
      ) {
        // Hide slots that have already started.
        if (cur <= now) continue;

        const candEnd = addMinutes(cur, params.durationMin);
        const conflict =
          t.bookings.some(
            (b) => cur < b.endsAt && candEnd > b.startsAt,
          ) ||
          t.timeOff.some(
            (o) => cur < o.endsAt && candEnd > o.startsAt,
          );
        if (!conflict) {
          slots.push({ startsAt: cur, endsAt: candEnd, therapistId: t.id });
        }
      }
    }
  }

  // Sort by time. Multiple therapists offering the same slot are kept; the
  // distinct-times helper below dedupes if the caller doesn't care which
  // therapist is assigned.
  slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return slots;
}

export async function getDistinctSlotTimes(params: {
  date: Date;
  durationMin: number;
  therapistId?: string;
}): Promise<Date[]> {
  const slots = await getAvailableSlots(params);
  const seen = new Set<number>();
  const out: Date[] = [];
  for (const s of slots) {
    const t = s.startsAt.getTime();
    if (!seen.has(t)) {
      seen.add(t);
      out.push(s.startsAt);
    }
  }
  return out;
}
