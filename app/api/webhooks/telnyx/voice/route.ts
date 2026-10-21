import { db } from "@/lib/db";
import { normalisePhone } from "@/lib/phone";
import { readTelnyxRequest } from "@/lib/telnyx-webhook";
import { GREETING } from "@/lib/phone-agent/prompt";
import { speakAndListen } from "@/lib/phone-agent/texml";

// A call reached the clinic's Telnyx number (the clinic mobile forwards
// unanswered calls here). Set this URL as the TeXML application's voice URL,
// and /api/webhooks/telnyx/voice/status as its status callback.

export async function POST(req: Request) {
  const checked = await readTelnyxRequest(req);
  if (!checked.ok) return checked.response;
  const params = new URLSearchParams(checked.body);
  const callSid = params.get("CallSid");
  if (!callSid) return new Response("Missing CallSid", { status: 400 });

  const from = normalisePhone(params.get("From")) || null;
  await db.phoneCall.upsert({
    where: { callSid },
    create: { callSid, fromPhone: from },
    update: {},
  });
  return speakAndListen(GREETING);
}
