"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveBookingIntake } from "@/lib/booking-intake";

/**
 * The client completes the medical form for their own upcoming booking
 * (they chose "fill it in later" when booking online). Same validation and
 * record as the staff "Complete medical form" box, so the booking is ready
 * for treatment (and a health-fund claim) before they arrive.
 */
export async function submitMyHealthForm(
  bookingId: string,
  fd: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Please sign in again." };

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { clientId: true, status: true },
  });
  // Only the booking's own client, and only while it's still upcoming.
  if (!booking || booking.clientId !== session.user.id) return { error: "Booking not found." };
  if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") {
    return { error: "This booking can no longer be updated." };
  }

  const res = await saveBookingIntake({
    bookingId,
    fd,
    actorUserId: session.user.id,
    who: "client",
    auditAction: "CLIENT_COMPLETE_BOOKING_INTAKE",
  });
  if (res.error) return res;

  revalidatePath("/portal/bookings");
  revalidatePath(`/portal/bookings/${bookingId}/health-form`);
  return { ok: true };
}
