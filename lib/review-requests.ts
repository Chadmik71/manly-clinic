import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyReviewRequest } from "@/lib/notify";
import { getClinicSettingsSafe } from "@/lib/clinic-settings";
import { withDbRetry } from "@/lib/db-retry";
import { sydneyDateOf, sydneyDayBoundsUtc } from "@/lib/time";

// Post-visit Google review requests.
//
// Finds COMPLETED bookings whose session was on a previous day (Sydney), where
// the customer opted into marketing/news and hasn't been asked in the last 90
// days, and sends them a one-tap Google review SMS. Each booking is stamped so
// it's never re-asked, and the client's lastReviewRequestAt throttles regulars.
//
// Gated by the ClinicSetting.reviewRequestEnabled admin toggle. Designed to run
// once daily — it's invoked from the daily-report cron (which already fires at
// 21:00 Sydney) and is also exposed at /api/cron/review-requests for manual runs.

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 3; // catch sessions completed a little late

export async function sendDueReviewRequests(
  source: string,
): Promise<{ enabled: boolean; candidates: number; sent: number }> {
  const settings = await getClinicSettingsSafe();
  if (!settings.reviewRequestEnabled) {
    return { enabled: false, candidates: 0, sent: 0 };
  }

  const now = new Date();
  // Only sessions BEFORE the start of today (Sydney) — this gives the "next
  // day" timing. A small lookback catches sessions completed late so they
  // still get exactly one request.
  const todayStart = sydneyDayBoundsUtc(sydneyDateOf(now)).start;
  const windowStart = new Date(
    todayStart.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  const reAskCutoff = new Date(now.getTime() - NINETY_DAYS_MS);

  const due = await withDbRetry(() =>
    db.booking.findMany({
      where: {
        status: "COMPLETED",
        reviewRequestSentAt: null,
        startsAt: { gte: windowStart, lt: todayStart },
        client: {
          marketingConsent: true,
          phone: { not: null },
          OR: [
            { lastReviewRequestAt: null },
            { lastReviewRequestAt: { lt: reAskCutoff } },
          ],
        },
      },
      include: { client: { select: { id: true, name: true, phone: true } } },
      orderBy: { startsAt: "asc" },
    }),
  );

  let sent = 0;
  // De-dupe within this run: a client with two completed sessions in the
  // window only gets one SMS; the extra bookings are still stamped so they
  // aren't reconsidered tomorrow.
  const askedClientIds = new Set<string>();
  for (const b of due) {
    if (!b.client.phone) continue;
    if (askedClientIds.has(b.client.id)) {
      await db.booking.update({
        where: { id: b.id },
        data: { reviewRequestSentAt: now },
      });
      continue;
    }
    askedClientIds.add(b.client.id);
    await notifyReviewRequest({ phone: b.client.phone, name: b.client.name });
    await db.booking.update({
      where: { id: b.id },
      data: { reviewRequestSentAt: now },
    });
    await db.user.update({
      where: { id: b.client.id },
      data: { lastReviewRequestAt: now },
    });
    await audit({
      userId: null,
      action: "REVIEW_REQUEST_SENT",
      resource: `Booking:${b.id}`,
      metadata: { source, clientId: b.client.id },
    });
    sent++;
  }

  return { enabled: true, candidates: due.length, sent };
}
