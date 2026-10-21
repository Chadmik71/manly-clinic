// Calls the Twilio voice webhooks on a running dev server the way Twilio
// would (signed form posts). Start the server with a throwaway token:
//   TWILIO_AUTH_TOKEN=local-test-token npm run dev
//   npx tsx scripts/test-phone-webhooks.ts
// Covers everything except the AI model itself (see test-phone-agent.ts).
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { signTwilioRequest } from "@/lib/twilio-webhook";

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";
const TOKEN = "local-test-token";

async function post(path: string, fields: Record<string, string>, opts: { badSig?: boolean } = {}) {
  const url = `${BASE}${path}`;
  const params = new URLSearchParams(fields);
  const sig = opts.badSig ? "nope" : signTwilioRequest(url, params, TOKEN);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-twilio-signature": sig },
    body: params,
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  const callSid = `CA-test-hook-${Date.now()}`;
  const from = "+61400000124";

  const forged = await post("/api/webhooks/twilio/voice", { CallSid: callSid, From: from }, { badSig: true });
  assert.equal(forged.status, 403, "unsigned calls are refused");

  const greet = await post("/api/webhooks/twilio/voice", { CallSid: callSid, From: from });
  assert.equal(greet.status, 200);
  assert.match(greet.body, /<Gather input="speech" action="\/api\/webhooks\/twilio\/voice\/turn"/);
  assert.match(greet.body, /automated assistant/, "greeting says it's an automated assistant");
  const row = await db.phoneCall.findUniqueOrThrow({ where: { callSid } });
  assert.equal(row.fromPhone, "0400000124");

  const silent1 = await post("/api/webhooks/twilio/voice/turn", { CallSid: callSid, SpeechResult: "" });
  assert.match(silent1.body, /Are you still there\?.*<\/Gather>/);
  const silent2 = await post("/api/webhooks/twilio/voice/turn", { CallSid: callSid, SpeechResult: "" });
  assert.match(silent2.body, /<Hangup\/>/, "two silences end the call");

  const end = await post("/api/webhooks/twilio/voice/status", { CallSid: callSid, CallStatus: "completed" });
  assert.equal(end.status, 204);
  const again = await post("/api/webhooks/twilio/voice/status", { CallSid: callSid, CallStatus: "completed" });
  assert.equal(again.status, 204);
  const ended = await db.phoneCall.findUniqueOrThrow({ where: { callSid } });
  assert.ok(ended.endedAt, "end time recorded");
  assert.equal(ended.teamNotified, true, "missed-call email sent (once) for a call with no booking");

  const sms = await post("/api/webhooks/twilio/sms", { From: from, Body: "hello" }, { badSig: true });
  assert.equal(sms.status, 403, "SMS webhook still checks signatures after the refactor");

  await db.phoneCall.delete({ where: { callSid } });
  console.log("PASS phone webhooks: signature check, greeting, silence hang-up, missed-call email");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
