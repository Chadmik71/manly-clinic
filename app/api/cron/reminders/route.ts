import { NextResponse } from "next/server";
import { subHours } from "date-fns";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyBookingReminder } from "@/lib/notify";
import { requireCronAuth } from "@/lib/cron-auth";
import { withDbRetry } from "@/lib/db-retry";
import { sydneyDateOf, sydneyDayBoundsUtc, sydneyTodayISO } from "@/lib/time";

// Sends a reminder for every booking on tomorrow's Sydney date that hasn't
// already been reminded (REMINDER_SENT in AuditLog). Runs once a day in the
// evening: the Vercel Hobby plan only allows daily cron jobs, so the old
// "every 15 min, bookings 23-25h away" window would have skipped most of them.
//
// Auth: fails closed without CRON_SECRET. Vercel Cron injects
// `Authorization: Bearer <CRON_SECRET>` automatically; manual / external
// schedulers can also pass `?secret=<CRON_SECRET>`. See lib/cron-auth.ts.
//
// Trigger: vercel.json crons block, daily at 07:00 UTC (5 pm AEST / 6 pm AEDT).
// Safe to re-run: already-reminded bookings are skipped.
export async function GET(req: Request) {
  const unauth = requireCronAuth(req);
  if (unauth) return unauth;

  const now = new Date();
  const today = sydneyDayBoundsUtc(sydneyTodayISO());
  const { start: windowStart, end: windowEnd } = sydneyDayBoundsUtc(sydneyDateOf(today.end));

  const dueBookings = await withDbRetry(() =>
    db.booking.findMany({
      where: {
        startsAt: { gte: windowStart, lt: windowEnd },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      include: {
        service: { select: { name: true } },
        variant: { select: { durationMin: true } },
        client: { select: { name: true, email: true, phone: true } },
      },
    }),
  );

  // Check which ones already had a REMINDER_SENT audit entry recently
  const recentlyReminded = await withDbRetry(() =>
    db.auditLog.findMany({
      where: {
        action: "REMINDER_SENT",
        createdAt: { gte: subHours(now, 48) },
      },
      select: { resource: true },
    }),
  );
  const sentSet = new Set(
    recentlyReminded
      .map((a) => a.resource)
      .filter((s): s is string => !!s),
  );

  let sent = 0;
  for (const b of dueBookings) {
    const tag = `Booking:${b.id}`;
    if (sentSet.has(tag)) continue;
    await notifyBookingReminder({
      email: b.client.email,
      phone: b.client.phone,
      name: b.client.name,
      reference: b.reference,
      serviceName: b.service.name,
      startsAt: b.startsAt,
    });
    await audit({
      userId: null,
      action: "REMINDER_SENT",
      resource: tag,
    });
    sent++;
  }

  return NextResponse.json({
    ok: true,
    candidates: dueBookings.length,
    sent,
    window: { from: windowStart.toISOString(), to: windowEnd.toISOString() },
  });
}
