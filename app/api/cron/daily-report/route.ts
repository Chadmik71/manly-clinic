import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireCronAuth } from "@/lib/cron-auth";
import { withDbRetry } from "@/lib/db-retry";
import {
  notifyDailyReport,
  type DailyReportBooking,
} from "@/lib/notify";
import { sendDueReviewRequests } from "@/lib/review-requests";
import {
  SYDNEY_TZ,
  sydneyDateOf,
  sydneyDayBoundsUtc,
  sydneyDateLong,
  sydneyTimeShort,
} from "@/lib/time";

// Daily ops report. Queries the day's stats + tomorrow's roster and emails
// it to the admin recipients. Triggered at 21:00 Sydney by cron-job.org.
//
// Auth: shared CRON_SECRET via lib/cron-auth (Bearer header or ?secret=...).
// Resilience: DB calls wrapped in withDbRetry so a cold-Neon hit doesn't 500.

const REPORT_RECIPIENTS = [
  "info@manlyremedialthai.com.au",
  "chadmik711@gmail.com",
];

export async function GET(req: Request) {
  const unauth = requireCronAuth(req);
  if (unauth) return unauth;

  const now = new Date();
  const todayISO = sydneyDateOf(now); // YYYY-MM-DD in Sydney
  const today = sydneyDayBoundsUtc(todayISO); // { start, end } UTC instants
  // "Tomorrow" computed via the existing Sydney bounds helper: take today's
  // end (= tomorrow's start in UTC), feed back as YYYY-MM-DD.
  const tomorrowISO = sydneyDateOf(today.end);
  const tomorrow = sydneyDayBoundsUtc(tomorrowISO);

  // ----- Today's stats -----
  const todayBookings = await withDbRetry(() =>
    db.booking.findMany({
      where: {
        startsAt: { gte: today.start, lt: today.end },
      },
      select: {
        status: true,
        priceCentsAtBooking: true,
        claimWithHealthFund: true,
      },
    }),
  );

  const todayStats = {
    bookings: todayBookings.length,
    grossRevenueCents: todayBookings.reduce(
      (s, b) => s + (b.priceCentsAtBooking ?? 0),
      0,
    ),
    completed: todayBookings.filter((b) => b.status === "COMPLETED").length,
    noShows: todayBookings.filter((b) => b.status === "NO_SHOW").length,
    cancellations: todayBookings.filter((b) => b.status === "CANCELLED")
      .length,
  };

  const hicapsToday = todayBookings.filter((b) => b.claimWithHealthFund);
  const hicaps = {
    count: hicapsToday.length,
    grossClaimedCents: hicapsToday.reduce(
      (s, b) => s + (b.priceCentsAtBooking ?? 0),
      0,
    ),
  };

  // ----- Tomorrow's roster -----
  const tomorrowRows = await withDbRetry(() =>
    db.booking.findMany({
      where: {
        startsAt: { gte: tomorrow.start, lt: tomorrow.end },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      orderBy: { startsAt: "asc" },
      include: {
        service: { select: { name: true } },
        client: { select: { name: true } },
        therapist: { include: { user: { select: { name: true } } } },
      },
    }),
  );

  const tomorrowList: DailyReportBooking[] = tomorrowRows.map((b) => ({
    time: sydneyTimeShort(b.startsAt),
    client: b.client.name,
    service: b.service.name,
    therapist:
      b.assignedTherapistName ??
      b.therapist?.user?.name ??
      b.slotLabel ??
      null,
  }));

  // ----- New customer sign-ups today -----
  const newSignups = await withDbRetry(() =>
    db.user.count({
      where: {
        role: "CLIENT",
        createdAt: { gte: today.start, lt: today.end },
      },
    }),
  );

  // ----- Anomalies -----
  // 1. Past CONFIRMED bookings that the auto-completer should have flipped.
  //    Use a 30-minute grace window matching the cron's own filter.
  const staleCutoff = new Date(now.getTime() - 30 * 60 * 1000);
  const stalePastConfirmed = await withDbRetry(() =>
    db.booking.count({
      where: {
        status: "CONFIRMED",
        endsAt: { lt: staleCutoff },
      },
    }),
  );

  // 2. Upcoming bookings (next 7 days) without a customer-facing therapist
  //    assignment. Only relevant when there are real bookings; surfaces an
  //    operator action item.
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const upcomingWithoutTherapist = await withDbRetry(() =>
    db.booking.count({
      where: {
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { gte: now, lt: sevenDaysOut },
        therapistId: null,
      },
    }),
  );

  // ----- Compose date labels for human display -----
  // Sample at noon Sydney for the label so DST-edge midnight ambiguity
  // doesn't accidentally show the wrong calendar day in the heading.
  const noonOfToday = new Date(today.start.getTime() + 12 * 60 * 60 * 1000);
  const noonOfTomorrow = new Date(tomorrow.start.getTime() + 12 * 60 * 60 * 1000);
  const todayDateLong = sydneyDateLong(noonOfToday);
  const tomorrowDateLong = sydneyDateLong(noonOfTomorrow);

  await notifyDailyReport({
    to: REPORT_RECIPIENTS,
    todayDateLong,
    tomorrowDateLong,
    today: todayStats,
    tomorrow: tomorrowList,
    hicaps,
    newSignups,
    anomalies: { stalePastConfirmed, upcomingWithoutTherapist },
  });

  // Piggyback the post-visit Google review SMS run on this daily schedule.
  // No-ops unless the admin has enabled it in Settings. Never throws so a
  // review-send hiccup can't break the daily report.
  let reviewRequests: { enabled: boolean; candidates: number; sent: number } = {
    enabled: false,
    candidates: 0,
    sent: 0,
  };
  try {
    reviewRequests = await sendDueReviewRequests("cron:daily-report");
  } catch (err) {
    console.error("[cron/daily-report] review-request send failed", err);
  }

  return NextResponse.json({
    ok: true,
    date: todayISO,
    timezone: SYDNEY_TZ,
    sent_to: REPORT_RECIPIENTS,
    today: todayStats,
    tomorrow_count: tomorrowList.length,
    hicaps,
    new_signups: newSignups,
    anomalies: { stalePastConfirmed, upcomingWithoutTherapist },
    reviewRequests,
  });
}
