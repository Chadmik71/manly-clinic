"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { saveBookingIntake } from "@/lib/booking-intake";
import { verifyKioskToken } from "@/lib/kiosk";

/**
 * Health form submitted by the client on the shop tablet. Authorised by the
 * signed, time-limited kiosk token for this one booking (not by the staff
 * login that happens to be on the tablet).
 */
export async function submitKioskForm(
  token: string,
  bookingId: string,
  fd: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const t = verifyKioskToken(token);
  if (!t || t.bookingId !== bookingId) return { error: "This form link isn't valid. Please hand the tablet back to staff." };
  if (t.expired) return { error: "This form has timed out. Please hand the tablet back to staff." };

  const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { clientId: true, status: true } });
  if (!booking) return { error: "Booking not found." };
  if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") {
    return { error: "This booking can no longer be updated. Please hand the tablet back to staff." };
  }

  const res = await saveBookingIntake({
    bookingId,
    fd,
    actorUserId: booking.clientId,
    who: "client",
    auditAction: "KIOSK_COMPLETE_BOOKING_INTAKE",
  });
  if (res.error) return res;
  revalidatePath(`/staff/bookings/${bookingId}`);
  revalidatePath("/staff/schedule");
  return { ok: true };
}
