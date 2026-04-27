import { db } from "@/lib/db";
import { addMinutes, startOfDay, endOfDay } from "date-fns";
import {
  BOOKING_LATEST_END_MIN,
  BOOKING_EARLIEST_START_MIN,
} from "@/lib/clinic";

export type Slot = { startsAt: Date; endsAt: Date; therapistId: string };

/**
 * Compute available slots for a given service variant on a specific day,
 * across all active therapists. Returns 15-minute aligned slots that fit
 * within at least one therapist's availability and don't overlap existing
 * bookings or time-off. Sessions must end by BOOKING_LATEST_END_MIN.
 */
export async function getAvailableSlots(params: {
  date: Date;
  durationMin: number;
  therapistId?: string;
  stepMin?: number;
}): Promise<Slot[]> {
  const step = params.stepMin ?? 15;
  const dayStart = startOfDay(params.date);
  const dayEnd = endOfDay(params.date);
  const dow = dayStart.getDay();

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
  // Sort by time, dedupe identical timestamps (multiple therapists -> keep first)
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
