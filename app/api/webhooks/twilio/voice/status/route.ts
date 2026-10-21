import { db } from "@/lib/db";
import { notifyClinicUnfinishedCall } from "@/lib/notify";
import { readTwilioRequest } from "@/lib/twilio-webhook";

// Twilio's "Call status changes" webhook. When a call ends without a booking
// or a message, email the clinic so the caller still gets a call back.

const ENDED = new Set(["completed", "busy", "no-answer", "failed", "canceled"]);

export async function POST(req: Request) {
  const checked = await readTwilioRequest(req);
  if (!checked.ok) return checked.response;
  const callSid = checked.params.get("CallSid");
  const status = checked.params.get("CallStatus") ?? "";
  if (!callSid || !ENDED.has(status)) return new Response(null, { status: 204 });

  const call = await db.phoneCall.findUnique({ where: { callSid } });
  if (!call) return new Response(null, { status: 204 });

  await db.phoneCall.update({ where: { callSid }, data: { endedAt: call.endedAt ?? new Date() } });
  if (call.bookingRefs || call.teamNotified) return new Response(null, { status: 204 });

  // Mark first so a retried webhook can't send the email twice.
  const claimed = await db.phoneCall.updateMany({
    where: { callSid, teamNotified: false },
    data: { teamNotified: true },
  });
  if (claimed.count === 1) {
    await notifyClinicUnfinishedCall({
      callerId: call.fromPhone,
      reason:
        call.turnCount === 0
          ? "Someone called and hung up during the phone assistant's greeting."
          : "A caller spoke with the phone assistant but hung up before booking or leaving a message.",
    });
  }
  return new Response(null, { status: 204 });
}
