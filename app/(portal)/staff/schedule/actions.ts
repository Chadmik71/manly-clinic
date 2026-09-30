"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAvailableSlots } from "@/lib/booking";
import { audit } from "@/lib/audit";
import { CHECKOUT_METHODS } from "@/lib/checkout";
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
  arrivedAtIso: string | null;
  checkoutMethod: string | null;
  checkoutCents: number | null;
  clientConfirmedAtIso: string | null;
  clientConfirmedVia: string | null;
  serviceId: string;
  variantId: string;
  therapistId: string | null;
  /** Health-fund claim still missing the treating therapist (needed before
   *  it can be marked completed). */
  needsTreatingTherapist: boolean;
  /** User id of the therapist whose column the booking is in (default pick). */
  columnTherapistUserId: string | null;
  /** Staff who can be recorded as the treating therapist. */
  treatingOptions: { userId: string; name: string }[];
  client: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    visitCount: number;
    noShowCount: number;
    preferences: string | null;
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
      arrivedAt: true,
      checkoutMethod: true,
      checkoutCents: true,
      clientConfirmedAt: true,
      clientConfirmedVia: true,
      serviceId: true,
      variantId: true,
      therapistId: true,
      assignedTherapistId: true,
      therapist: { select: { userId: true } },
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
          preferences: true,
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

  const needsTreatingTherapist = b.claimWithHealthFund && !b.assignedTherapistId;
  const treatingOptions = needsTreatingTherapist
    ? (
        await db.therapist.findMany({
          where: { active: true },
          select: { user: { select: { id: true, name: true } } },
          orderBy: { user: { name: "asc" } },
        })
      ).map((t) => ({ userId: t.user.id, name: t.user.name }))
    : [];

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
      arrivedAtIso: b.arrivedAt ? b.arrivedAt.toISOString() : null,
      checkoutMethod: b.checkoutMethod,
      checkoutCents: b.checkoutCents,
      clientConfirmedAtIso: b.clientConfirmedAt ? b.clientConfirmedAt.toISOString() : null,
      clientConfirmedVia: b.clientConfirmedVia,
      serviceId: b.serviceId,
      variantId: b.variantId,
      therapistId: b.therapistId,
      needsTreatingTherapist,
      columnTherapistUserId: b.therapist?.userId ?? null,
      treatingOptions,
      // Placeholder addresses (no real email on file) aren't worth showing.
      client: { ...b.client, email: isPlaceholderEmail(b.client.email) ? "" : b.client.email },
    },
  };
}

async function requireStaffUser() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "STAFF" && session.user.role !== "ADMIN")) return null;
  return session.user;
}

/** Front-desk check-in: mark (or unmark) the client as arrived. */
export async function setBookingArrived(
  bookingId: string,
  arrived: boolean,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireStaffUser();
  if (!user) return { error: "Unauthorized" };
  const b = await db.booking.findUnique({ where: { id: bookingId }, select: { status: true } });
  if (!b) return { error: "Booking not found." };
  if (arrived && b.status !== "PENDING" && b.status !== "CONFIRMED") {
    return { error: "Only upcoming bookings can be checked in." };
  }
  await db.booking.update({ where: { id: bookingId }, data: { arrivedAt: arrived ? new Date() : null } });
  await audit({
    userId: user.id,
    action: arrived ? "BOOKING_ARRIVED" : "BOOKING_ARRIVED_UNDO",
    resource: `Booking:${bookingId}`,
  });
  return { ok: true };
}



/**
 * Record the payment taken at the clinic at checkout (method + amount), or
 * clear it with method null. Separate from the online deposit (paidCents).
 */
export async function recordCheckout(
  bookingId: string,
  method: string | null,
  cents: number,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireStaffUser();
  if (!user) return { error: "Unauthorized" };
  const b = await db.booking.findUnique({ where: { id: bookingId }, select: { status: true } });
  if (!b) return { error: "Booking not found." };
  if (b.status === "CANCELLED") return { error: "This booking is cancelled." };
  if (method === null) {
    await db.booking.update({
      where: { id: bookingId },
      data: { checkoutMethod: null, checkoutCents: null, checkoutAt: null, checkoutById: null },
    });
    await audit({ userId: user.id, action: "CHECKOUT_CLEARED", resource: `Booking:${bookingId}` });
    return { ok: true };
  }
  if (!(CHECKOUT_METHODS as readonly string[]).includes(method)) return { error: "Choose how they paid." };
  if (!Number.isInteger(cents) || cents < 0 || cents > 1_000_000) return { error: "Enter a valid amount." };
  await db.booking.update({
    where: { id: bookingId },
    data: { checkoutMethod: method, checkoutCents: cents, checkoutAt: new Date(), checkoutById: user.id },
  });
  await audit({
    userId: user.id,
    action: "CHECKOUT_RECORDED",
    resource: `Booking:${bookingId}`,
    metadata: { method, cents },
  });
  return { ok: true };
}
