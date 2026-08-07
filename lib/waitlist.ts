// Waitlist matching. Called after any booking transitions to CANCELLED or
// NO_SHOW (see the three call sites: portal/bookings/actions.ts cancelBooking,
// staff/bookings/[id]/actions.ts setBookingStatus, staff/refunds/actions.ts
// approveRefund). Best-effort and non-blocking: a failure here must never
// break the cancellation/refund flow that triggered it.

import { db } from "@/lib/db";
import { notifyWaitlistSlotOpen } from "@/lib/notify";
import { sydneyDateLong, sydneyDayBoundsUtc } from "@/lib/time";

/**
 * Notify every WAITING entry for {date, serviceId}. There is no reservation
 * system — everyone matched gets notified at once, and whoever books first
 * gets the spot (the notification copy says so explicitly). Each notified
 * entry flips to NOTIFIED so it isn't re-notified on a later cancellation
 * for the same day.
 */
export async function matchAndNotifyWaitlist(params: {
  date: string; // Sydney YYYY-MM-DD, e.g. sydneyDateOf(booking.startsAt)
  serviceId: string;
}): Promise<void> {
  try {
    const entries = await db.waitlistEntry.findMany({
      where: { date: params.date, serviceId: params.serviceId, status: "WAITING" },
      include: { service: { select: { name: true, slug: true } } },
    });
    if (entries.length === 0) return;

    // Sample at Sydney noon (midnight + 12h) rather than hardcoding a UTC
    // offset, since Sydney alternates between +10 (AEST) and +11 (AEDT).
    const noonOnDate = new Date(sydneyDayBoundsUtc(params.date).start.getTime() + 12 * 60 * 60 * 1000);
    const dateLabel = sydneyDateLong(noonOnDate);

    for (const entry of entries) {
      try {
        await notifyWaitlistSlotOpen({
          email: entry.guestEmail,
          phone: entry.guestPhone,
          name: entry.guestName,
          serviceName: entry.service.name,
          serviceSlug: entry.service.slug,
          date: entry.date,
          dateLabel,
        });
        await db.waitlistEntry.update({
          where: { id: entry.id },
          data: { status: "NOTIFIED", notifiedAt: new Date() },
        });
      } catch (err) {
        console.error("[waitlist] notify failed for entry", entry.id, err);
        // Leave this entry WAITING — don't let one bad send block the rest.
      }
    }
  } catch (err) {
    console.error("[waitlist] matchAndNotifyWaitlist failed", err);
  }
}
