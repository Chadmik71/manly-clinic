"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAvailableSlots } from "@/lib/booking";

/**
 * Walk-in finder — for when a customer is standing at the counter asking
 * "got anything in the next couple of hours?". Returns the soonest
 * available slots for the requested duration across all active
 * therapists, sorted by start time. Capped at 8 results so the dialog
 * stays compact.
 */
export async function findWalkinSlots(
  durationMin: number,
): Promise<{
  ok: true;
  slots: {
    startsAtIso: string;
    endsAtIso: string;
    therapistId: string;
    therapistName: string;
  }[];
} | { ok: false; error: string }> {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  ) {
    return { ok: false, error: "Unauthorized" };
  }
  if (![30, 45, 60, 90, 120].includes(durationMin)) {
    return { ok: false, error: "Unsupported duration." };
  }

  const now = new Date();
  // getAvailableSlots filters out times that have already started, so the
  // result is naturally "what's free from this moment onwards today".
  const slots = await getAvailableSlots({ date: now, durationMin });

  if (slots.length === 0) {
    return { ok: true, slots: [] };
  }

  const therapistIds = [...new Set(slots.map((s) => s.therapistId))];
  const therapists = await db.therapist.findMany({
    where: { id: { in: therapistIds } },
    include: { user: { select: { name: true } } },
  });
  const nameById = new Map(therapists.map((t) => [t.id, t.user.name]));

  return {
    ok: true,
    slots: slots.slice(0, 8).map((s) => ({
      startsAtIso: s.startsAt.toISOString(),
      endsAtIso: s.endsAt.toISOString(),
      therapistId: s.therapistId,
      therapistName: nameById.get(s.therapistId) ?? "Therapist",
    })),
  };
}
