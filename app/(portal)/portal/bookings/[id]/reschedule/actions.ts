"use server";
import { addMinutes } from "date-fns";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  BOOKING_LATEST_END_MIN,
  BOOKING_EARLIEST_START_MIN,
} from "@/lib/clinic";
import { revalidatePath } from "next/cache";
import { notifyBookingRescheduled } from "@/lib/notify";

export async function rescheduleBooking(
  bookingId: string,
  newStartIso: string,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in required." };
  const b = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      variant: true,
      client: { select: { name: true, email: true, phone: true } },
    },
  });
  if (!b || b.clientId !== session.user.id) return { error: "Not found." };
  if (b.status !== "PENDING" && b.status !== "CONFIRMED")
    return { error: "Only upcoming bookings can be rescheduled." };

  const startsAt = new Date(newStartIso);
  if (isNaN(startsAt.getTime()) || startsAt < new Date())
    return { error: "Invalid time." };
  const endsAt = addMinutes(startsAt, b.variant.durationMin);
  const startMinutes = startsAt.getHours() * 60 + startsAt.getMinutes();
  const endMinutes = endsAt.getHours() * 60 + endsAt.getMinutes();
  const sameDay =
    endsAt.getDate() === startsAt.getDate() &&
    endsAt.getMonth() === startsAt.getMonth();
  if (
    startMinutes < BOOKING_EARLIEST_START_MIN ||
    !sameDay ||
    endMinutes > BOOKING_LATEST_END_MIN
  )
    return { error: "Sessions must finish by 8:00 pm." };

  // Find an available therapist (could be same as current, ignoring this booking)
  const dow = startsAt.getDay();
  const therapists = await db.therapist.findMany({
    where: { active: true },
    include: {
      availability: { where: { dayOfWeek: dow } },
      bookings: {
        where: {
          id: { not: bookingId },
          status: { in: ["PENDING", "CONFIRMED"] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      },
      timeOff: {
        where: { startsAt: { lt: endsAt }, endsAt: { gt: startsAt } },
      },
    },
  });
  // Prefer the same therapist if available, else any
  const sorted = [
    ...therapists.filter((t) => t.id === b.therapistId),
    ...therapists.filter((t) => t.id !== b.therapistId),
  ];
  const candidate = sorted.find(
    (t) =>
      t.availability.some(
        (a) => a.startMin <= startMinutes && a.endMin >= endMinutes,
      ) &&
      t.bookings.length === 0 &&
      t.timeOff.length === 0,
  );
  if (!candidate) return { error: "No therapist available at that time." };

  const oldStart = b.startsAt;
  await db.booking.update({
    where: { id: bookingId },
    data: { startsAt, endsAt, therapistId: candidate.id },
  });
  await audit({
    userId: session.user.id,
    action: "RESCHEDULE_BOOKING",
    resource: `Booking:${bookingId}`,
    metadata: { from: oldStart.toISOString(), to: startsAt.toISOString() },
  });
  await notifyBookingRescheduled({
    email: b.client.email,
    phone: b.client.phone,
    name: b.client.name,
    reference: b.reference,
    oldStart,
    newStart: startsAt,
  });
  revalidatePath("/portal/bookings");
  return { ok: true };
}
