import { db } from "@/lib/db";
import { addMinutes, addDays } from "date-fns";
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
  /** Couple bookings need 2 free therapists at the same time. Defaults to 1. */
  minTherapists?: number;
  /**
   * Couple bookings where the partner picks a different duration. When set
   * (and minTherapists ≥ 2), a slot time is only returned if ≥1 therapist
   * can do the primary duration AND ≥1 *different* therapist can do the
   * partner duration at the same start time.
   */
  partnerDurationMin?: number;
}): Promise<Date[]> {
  const slots = await getAvailableSlots(params);
  const minTherapists = params.minTherapists ?? 1;
  const partnerDur = params.partnerDurationMin;
  const useDualDuration =
    partnerDur != null && partnerDur !== params.durationMin && minTherapists >= 2;

  // Count *distinct* free therapists per slot time so we can enforce
  // minTherapists. Counting raw slot entries would over-count when a
  // therapist has overlapping availability rows on the same day (each row
  // re-emits the same slot), causing the picker to show times that the
  // confirm action then rejects with "two free therapists" for couples.
  const therapistsByTime = new Map<number, Set<string>>();
  for (const s of slots) {
    const t = s.startsAt.getTime();
    let set = therapistsByTime.get(t);
    if (!set) {
      set = new Set<string>();
      therapistsByTime.set(t, set);
    }
    set.add(s.therapistId);
  }

  // Dual-duration mode: also compute per-time therapists who can fit the
  // partner's (different) duration, then require a distinct pairing.
  let partnerTherapistsByTime: Map<number, Set<string>> | null = null;
  if (useDualDuration) {
    const partnerSlots = await getAvailableSlots({
      date: params.date,
      durationMin: partnerDur,
      therapistId: params.therapistId,
    });
    partnerTherapistsByTime = new Map<number, Set<string>>();
    for (const s of partnerSlots) {
      const t = s.startsAt.getTime();
      let set = partnerTherapistsByTime.get(t);
      if (!set) {
        set = new Set<string>();
        partnerTherapistsByTime.set(t, set);
      }
      set.add(s.therapistId);
    }
  }

  const seen = new Set<number>();
  const out: Date[] = [];
  for (const s of slots) {
    const t = s.startsAt.getTime();
    if (seen.has(t)) continue;
    const primarySet = therapistsByTime.get(t) ?? new Set<string>();
    if (useDualDuration && partnerTherapistsByTime) {
      const partnerSet = partnerTherapistsByTime.get(t) ?? new Set<string>();
      // Need ≥1 in each pool AND a distinct pairing across them.
      if (primarySet.size === 0 || partnerSet.size === 0) continue;
      const union = new Set<string>([...primarySet, ...partnerSet]);
      if (union.size < minTherapists) continue;
      seen.add(t);
      out.push(s.startsAt);
    } else if (primarySet.size >= minTherapists) {
      seen.add(t);
      out.push(s.startsAt);
    }
  }
  return out;
}

/**
 * Find the single earliest bookable slot start across all therapists, scanning
 * forward day-by-day from now. Used by the home-page hero to reassure visitors
 * with a live "next available" time. Returns null if nothing is open within the
 * lookahead window.
 *
 * `durationMin` defaults to 60 — the typical first-visit booking — so the
 * advertised time is realistic for what most people book. Returns on the first
 * day that has any slot, so the common case is a single DB round-trip.
 */
export async function getNextAvailableSlot(params?: {
  durationMin?: number;
  maxDaysAhead?: number;
}): Promise<Date | null> {
  const durationMin = params?.durationMin ?? 60;
  const maxDays = params?.maxDaysAhead ?? 14;
  const today = new Date();
  for (let i = 0; i < maxDays; i++) {
    // Any instant on the desired day; getAvailableSlots derives the Sydney
    // calendar date from it and hides slots that have already started.
    const times = await getDistinctSlotTimes({
      date: addDays(today, i),
      durationMin,
    });
    if (times.length > 0) return times[0];
  }
  return null;
}
