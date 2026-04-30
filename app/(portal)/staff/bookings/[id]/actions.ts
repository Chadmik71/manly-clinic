"use server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { notifyBookingCancelled } from "@/lib/notify";

const ALLOWED = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];

export async function setBookingStatus(
  id: string,
  status: string,
  notifyClient?: boolean,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  )
    return { error: "Forbidden." };
  if (!ALLOWED.includes(status)) return { error: "Invalid status." };

  // Fetch the booking once. Needed for the (optional) cancellation email,
  // and lets us return a clean "Not found." instead of a Prisma error.
  const booking = await db.booking.findUnique({
    where: { id },
    include: { client: { select: { email: true, name: true, phone: true } } },
  });
  if (!booking) return { error: "Not found." };

  await db.booking.update({
    where: { id },
    data: {
      status,
      ...(status === "CANCELLED" ? { cancelledAt: new Date() } : {}),
    },
  });

  await audit({
    userId: session.user.id,
    action: "UPDATE_BOOKING_STATUS",
    resource: `Booking:${id}`,
    metadata: { status, notifyClient: notifyClient ?? false },
  });

  // Staff-initiated cancellations: send notification email only when staff
  // explicitly opts in via the UI checkbox. Per clinic policy, staff cancels
  // never charge a late-cancel fee (only client self-cancels do), so feeCents
  // is always 0 here.
  if (status === "CANCELLED" && notifyClient) {
    await notifyBookingCancelled({
      email: booking.client.email,
      phone: booking.client.phone,
      name: booking.client.name,
      reference: booking.reference,
      startsAt: booking.startsAt,
      feeCents: 0,
    });
  }

  revalidatePath(`/staff/bookings/${id}`);
  revalidatePath("/staff/bookings");
  revalidatePath("/staff");
  return { ok: true };
}
