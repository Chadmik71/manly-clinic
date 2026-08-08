import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { notifyReviewRequest, notifyPostVisitFollowUp } from "@/lib/notify";
import { getClinicSettingsSafe } from "@/lib/clinic-settings";
import { withDbRetry } from "@/lib/db-retry";
import { sydneyDateOf, sydneyDayBoundsUtc } from "@/lib/time";

// Post-visit outreach: a "book again" email plus (for proven repeat
// customers) a Google review SMS.
//
// Finds COMPLETED bookings whose session was on a previous day (Sydney),
// where the customer opted into marketing/news and hasn't been asked in the
// last 90 days. Every matching client gets the "book again" email; only
// clients on at least their 2nd visit (imported visitCount + in-app COMPLETED
// bookings) also get the Google review SMS — a first-time visitor hasn't had
// the chance to become a fan yet. Each booking is stamped so it's never
// re-processed, and the client's lastReviewRequestAt throttles regulars.
//
// Gated by the ClinicSetting.reviewRequestEnabled admin toggle. Designed to run
// once daily — it's invoked from the daily-report cron (which already fires at
// 21:00 Sydney) and is also exposed at /api/cron/review-requests for manual runs.

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const LOOKBACK_DAYS = 3; // catch sessions completed a little late
const REPEAT_VISIT_THRESHOLD = 2;

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
          OR: [
            { lastReviewRequestAt: null },
            { lastReviewRequestAt: { lt: reAskCutoff } },
          ],
        },
      },
      include: {
        client: {
          select: { id: true, name: true, email: true, phone: true, visitCount: true },
        },
        service: { select: { name: true, slug: true } },
      },
      orderBy: { startsAt: "asc" },
    }),
  );

  let sent = 0;
  // De-dupe within this run: a client with two completed sessions in the
  // window only gets one message per channel; the extra bookings are still
  // stamped so they aren't reconsidered tomorrow.
  const askedClientIds = new Set<string>();
  for (const b of due) {
    if (askedClientIds.has(b.client.id)) {
      await db.booking.update({
        where: { id: b.id },
        data: { reviewRequestSentAt: now },
      });
      continue;
    }
    askedClientIds.add(b.client.id);

    await notifyPostVisitFollowUp({
      email: b.client.email,
      name: b.client.name,
      serviceName: b.service.name,
      serviceSlug: b.service.slug,
      variantId: b.variantId,
    });

    // Only ask proven repeat customers for a review — a first-time visitor
    // hasn't necessarily formed an opinion worth broadcasting yet. Total
    // visits = imported legacy count + in-app completed bookings so far.
    const priorInAppCompleted = await db.booking.count({
      where: { clientId: b.client.id, status: "COMPLETED" },
    });
    const totalVisits = b.client.visitCount + priorInAppCompleted;
    if (b.client.phone && totalVisits >= REPEAT_VISIT_THRESHOLD) {
      await notifyReviewRequest({ phone: b.client.phone, name: b.client.name });
    }

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
      metadata: { source, clientId: b.client.id, totalVisits },
    });
    sent++;
  }

  return { enabled: true, candidates: due.length, sent };
}
