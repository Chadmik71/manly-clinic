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
import { sydneyDateOf } from "@/lib/time";

// Renders a Date in Sydney calendar time, returning minute-of-day (0..1439).
// Vercel runs in UTC; raw getHours/getMinutes would give UTC values for our
// startsAt/endsAt. This helper formats via Intl with timeZone Australia/Sydney
// so booking-window checks compare apples to apples.
const SYD_HM_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function sydneyMinuteOfDay(d: Date): number {
  const parts = SYD_HM_FMT.formatToParts(d);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

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
  const startMinutes = sydneyMinuteOfDay(startsAt);
  const endMinutes = sydneyMinuteOfDay(endsAt);
  const sameDay = sydneyDateOf(startsAt) === sydneyDateOf(endsAt);
  if (
    startMinutes < BOOKING_EARLIEST_START_MIN ||
    !sameDay ||
    endMinutes > BOOKING_LATEST_END_MIN
  )
    return { error: startMinutes < BOOKING_EARLIEST_START_MIN ? "Sessions must start at or after 9:00 am." : "Sessions must finish by 8:00 pm. Please pick an earlier time." };

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
