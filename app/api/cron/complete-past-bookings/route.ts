import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireCronAuth } from "@/lib/cron-auth";
import { withDbRetry } from "@/lib/db-retry";

// Marks past CONFIRMED bookings as COMPLETED.
//
// A booking is "past" when its end time (startsAt + variant.durationMin)
// is more than 30 minutes in the past. The 30-minute grace allows a session
// that runs long to finish without being auto-completed mid-treatment.
//
// Status transitions handled:
//   CONFIRMED -> COMPLETED   (the normal happy path)
//
// Status transitions NOT handled (intentional):
//   PENDING    -> not touched (waiting on customer action / payment)
//   CANCELLED  -> not touched
//   NO_SHOW    -> not touched (staff must mark these manually)
//   COMPLETED  -> already done
//
// Auth: shared with /api/cron/reminders via lib/cron-auth. Fails closed
// when CRON_SECRET is missing. Vercel Cron passes the bearer header
// automatically; external schedulers can use ?secret=...
//
// Trigger: scheduled via vercel.json crons block (every 30 min).
export async function GET(req: Request) {
  const unauth = requireCronAuth(req);
  if (unauth) return unauth;

  // Cut-off: 30 minutes ago. Any booking whose END time is before this is fair game.
  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 60 * 1000);

  // Fetch CONFIRMED bookings that started before the cutoff. We still need to
  // verify the END time on the application side because endsAt is computed from
  // variant.durationMin (not stored as a column).
  const candidates = await withDbRetry(() =>
    db.booking.findMany({
      where: {
        status: "CONFIRMED",
        startsAt: { lt: cutoff },
      },
      include: { variant: { select: { durationMin: true } } },
    }),
  );

  const toComplete = candidates.filter((b) => {
    const endsAt = new Date(
      b.startsAt.getTime() + b.variant.durationMin * 60 * 1000,
    );
    return endsAt < cutoff;
  });

  if (toComplete.length === 0) {
    return NextResponse.json({ ok: true, completed: 0 });
  }

  const ids = toComplete.map((b) => b.id);
  await withDbRetry(() =>
    db.booking.updateMany({
      where: { id: { in: ids } },
      data: { status: "COMPLETED" },
    }),
  );

  // Audit each transition so staff can see what the cron touched.
  // Best-effort; one failure does not abort the batch.
  for (const b of toComplete) {
    try {
      await audit({
        action: "booking.auto_completed",
        resource: `booking:${b.id}`,
        metadata: {
          bookingId: b.id,
          startedAt: b.startsAt.toISOString(),
          durationMin: b.variant.durationMin,
          prevStatus: "CONFIRMED",
          nextStatus: "COMPLETED",
          source: "cron",
        },
      });
    } catch (err) {
      // Audit failure must not break the bulk update.
      console.error("[cron/complete-past-bookings] audit failed", b.id, err);
    }
  }

  return NextResponse.json({ ok: true, completed: toComplete.length, ids });
}
