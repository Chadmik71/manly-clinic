import { NextResponse } from "next/server";
import { addHours, subHours } from "date-fns";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyBookingReminder } from "@/lib/notify";
import { requireCronAuth } from "@/lib/cron-auth";
import { withDbRetry } from "@/lib/db-retry";

// Sends reminders for bookings starting between [now+23h, now+25h] that
// haven't already been reminded (we use a metadata flag in AuditLog).
//
// Auth: fails closed without CRON_SECRET. Vercel Cron injects
// `Authorization: Bearer <CRON_SECRET>` automatically; manual / external
// schedulers can also pass `?secret=<CRON_SECRET>`. See lib/cron-auth.ts.
//
// Trigger: scheduled via vercel.json crons block (every 15 min).
export async function GET(req: Request) {
  const unauth = requireCronAuth(req);
  if (unauth) return unauth;

  const now = new Date();
  const windowStart = addHours(now, 23);
  const windowEnd = addHours(now, 25);

  const dueBookings = await withDbRetry(() =>
    db.booking.findMany({
      where: {
        startsAt: { gte: windowStart, lte: windowEnd },
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
        createdAt: { gte: subHours(now, 26) },
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
