import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyLapsedClient } from "@/lib/notify";
import { getClinicSettingsSafe } from "@/lib/clinic-settings";
import { withDbRetry } from "@/lib/db-retry";

// "We haven't seen you in a while" win-back nudge.
//
// Finds CLIENT users who opted into marketing/news, whose most recent in-app
// COMPLETED booking was more than LAPSED_WEEKS ago, who don't already have an
// upcoming PENDING/CONFIRMED booking, and who haven't been nudged in the last
// THROTTLE_DAYS. Sends one email (+ SMS if a mobile is on file) and stamps
// lastLapsedNudgeAt so they're not re-asked too often.
//
// Deliberately scoped to in-app booking history only — imported legacy
// clients (visitCount from the prior system, no dated Booking rows here)
// have no reliable "last visit" date in this app, so they're naturally
// excluded rather than nudged on a guess.
//
// Gated by the ClinicSetting.lapsedNudgeEnabled admin toggle. Designed to run
// once daily — invoked from the daily-report cron (21:00 Sydney) and also
// exposed at /api/cron/lapsed-clients for manual runs.

const LAPSED_WEEKS = 8;
const THROTTLE_DAYS = 120;

export async function sendDueLapsedNudges(
  source: string,
): Promise<{ enabled: boolean; candidates: number; sent: number }> {
  const settings = await getClinicSettingsSafe();
  if (!settings.lapsedNudgeEnabled) {
    return { enabled: false, candidates: 0, sent: 0 };
  }

  const now = new Date();
  const lapsedCutoff = new Date(now.getTime() - LAPSED_WEEKS * 7 * 24 * 60 * 60 * 1000);
  const throttleCutoff = new Date(now.getTime() - THROTTLE_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await withDbRetry(() =>
    db.user.findMany({
      where: {
        role: "CLIENT",
        marketingConsent: true,
        OR: [{ lastLapsedNudgeAt: null }, { lastLapsedNudgeAt: { lt: throttleCutoff } }],
        bookings: {
          some: { status: "COMPLETED" },
          none: { status: { in: ["PENDING", "CONFIRMED"] }, startsAt: { gte: now } },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        bookings: {
          where: { status: "COMPLETED" },
          orderBy: { startsAt: "desc" },
          take: 1,
          select: { startsAt: true },
        },
      },
    }),
  );

  const due = candidates.filter((c) => {
    const lastVisit = c.bookings[0]?.startsAt;
    return lastVisit !== undefined && lastVisit < lapsedCutoff;
  });

  let sent = 0;
  for (const c of due) {
    await notifyLapsedClient({ email: c.email, phone: c.phone, name: c.name });
    await db.user.update({
      where: { id: c.id },
      data: { lastLapsedNudgeAt: now },
    });
    await audit({
      userId: null,
      action: "LAPSED_CLIENT_NUDGE_SENT",
      resource: `User:${c.id}`,
      metadata: { source, lastVisitAt: c.bookings[0]?.startsAt.toISOString() },
    });
    sent++;
  }

  return { enabled: true, candidates: due.length, sent };
}
