import { db } from "@/lib/db";
import { normalisePhone } from "@/lib/phone";
import { readTwilioRequest } from "@/lib/twilio-webhook";
import { GREETING } from "@/lib/phone-agent/prompt";
import { speakAndListen } from "@/lib/phone-agent/twiml";

// A call reached the clinic's Twilio number (the clinic mobile forwards
// unanswered calls here). Set this URL as the number's "A call comes in"
// webhook, and /api/webhooks/twilio/voice/status as "Call status changes".

export async function POST(req: Request) {
  const checked = await readTwilioRequest(req);
  if (!checked.ok) return checked.response;
  const callSid = checked.params.get("CallSid");
  if (!callSid) return new Response("Missing CallSid", { status: 400 });

  const from = normalisePhone(checked.params.get("From")) || null;
  await db.phoneCall.upsert({
    where: { callSid },
    create: { callSid, fromPhone: from },
    update: {},
  });
  return speakAndListen(GREETING);
}
