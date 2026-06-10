import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { sendDueReviewRequests } from "@/lib/review-requests";

// Sends post-visit Google review SMS to consenting customers whose session
// completed on a previous day. Also invoked from the daily-report cron, so it
// runs on the existing 21:00 Sydney schedule without extra cron config — this
// route exists for manual/ad-hoc triggering and testing.
//
// Auth: shared CRON_SECRET via lib/cron-auth (Bearer header or ?secret=...).
export async function GET(req: Request) {
  const unauth = requireCronAuth(req);
  if (unauth) return unauth;
  const result = await sendDueReviewRequests("cron:review-requests");
  return NextResponse.json({ ok: true, ...result });
}
