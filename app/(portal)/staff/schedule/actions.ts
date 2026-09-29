"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAvailableSlots } from "@/lib/booking";
import { audit } from "@/lib/audit";
import { isPlaceholderEmail } from "@/lib/placeholder-email";

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

export type BookingSummary = {
  id: string;
  reference: string;
  status: string;
  startsAtIso: string;
  endsAtIso: string;
  serviceName: string;
  durationMin: number;
  priceCents: number;
  paidCents: number;
  voucherAppliedCents: number;
  claimWithHealthFund: boolean;
  isWalkIn: boolean;
  isCouple: boolean;
  notes: string | null;
  cancelReason: string | null;
  client: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    visitCount: number;
    noShowCount: number;
  };
};

/**
 * Booking details for the calendar's pop-up. Deliberately no health
 * information (intake, clinical notes): those stay on the full booking
 * page, which has its own audit entry. This view is logged too.
 */
export async function getBookingSummary(
  bookingId: string,
): Promise<{ ok: true; booking: BookingSummary } | { ok: false; error: string }> {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  ) {
    return { ok: false, error: "Unauthorized" };
  }

  const b = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      reference: true,
      status: true,
      startsAt: true,
      endsAt: true,
      priceCentsAtBooking: true,
      paidCents: true,
      voucherAppliedCents: true,
      claimWithHealthFund: true,
      isWalkIn: true,
      coupleGroupId: true,
      notes: true,
      cancelReason: true,
      service: { select: { name: true } },
      variant: { select: { durationMin: true } },
      client: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          visitCount: true,
          noShowCount: true,
        },
      },
    },
  });
  if (!b) return { ok: false, error: "Booking not found." };

  await audit({
    userId: session.user.id,
    action: "VIEW_BOOKING_SUMMARY",
    resource: `Booking:${b.id}`,
    metadata: { booking: b.reference },
  });

  return {
    ok: true,
    booking: {
      id: b.id,
      reference: b.reference,
      status: b.status,
      startsAtIso: b.startsAt.toISOString(),
      endsAtIso: b.endsAt.toISOString(),
      serviceName: b.service.name,
      durationMin: b.variant.durationMin,
      priceCents: b.priceCentsAtBooking,
      paidCents: b.paidCents,
      voucherAppliedCents: b.voucherAppliedCents,
      claimWithHealthFund: b.claimWithHealthFund,
      isWalkIn: b.isWalkIn,
      isCouple: b.coupleGroupId != null,
      notes: b.notes,
      cancelReason: b.cancelReason,
      // Placeholder addresses (no real email on file) aren't worth showing.
      client: { ...b.client, email: isPlaceholderEmail(b.client.email) ? "" : b.client.email },
    },
  };
}
