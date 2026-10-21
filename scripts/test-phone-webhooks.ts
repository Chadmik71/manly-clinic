// Calls the Telnyx webhooks on a running dev server the way Telnyx would
// (Ed25519-signed posts), using a fixed throwaway test key. Start the server
// with the matching public key:
//   TELNYX_PUBLIC_KEY=$(npx tsx scripts/test-phone-webhooks.ts --public-key) npm run dev
//   npx tsx scripts/test-phone-webhooks.ts
// Covers everything except the AI model itself (see test-phone-agent.ts).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { signTelnyxRequest } from "@/lib/telnyx-webhook";

const SEED = Buffer.alloc(32, 7);
const privateKey = crypto.createPrivateKey({
  key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), SEED]),
  format: "der",
  type: "pkcs8",
});
const publicKeyB64 = (crypto.createPublicKey(privateKey).export({ format: "der", type: "spki" }) as Buffer)
  .subarray(-32)
  .toString("base64");

const BASE = process.env.SMOKE_URL ?? "http://localhost:3000";

type PostOpts = { badSig?: boolean; ageSec?: number; json?: boolean };
async function post(path: string, payload: Record<string, string> | object, opts: PostOpts = {}) {
  const body = opts.json ? JSON.stringify(payload) : new URLSearchParams(payload as Record<string, string>).toString();
  const ts = String(Math.floor(Date.now() / 1000) - (opts.ageSec ?? 0));
  const sig = opts.badSig ? signTelnyxRequest(body + "x", ts, privateKey) : signTelnyxRequest(body, ts, privateKey);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": opts.json ? "application/json" : "application/x-www-form-urlencoded",
      "telnyx-signature-ed25519": sig,
      "telnyx-timestamp": ts,
    },
    body,
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  const { db } = await import("@/lib/db");
  const callSid = `v3:test-hook-${Date.now()}`;
  const from = "+61400000124";

  const forged = await post("/api/webhooks/telnyx/voice", { CallSid: callSid, From: from }, { badSig: true });
  assert.equal(forged.status, 403, "forged signatures are refused");
  const stale = await post("/api/webhooks/telnyx/voice", { CallSid: callSid, From: from }, { ageSec: 600 });
  assert.equal(stale.status, 403, "replayed (old) requests are refused");

  const greet = await post("/api/webhooks/telnyx/voice", { CallSid: callSid, From: from });
  assert.equal(greet.status, 200, `greeting answered (got ${greet.status}: ${greet.body.slice(0, 80)})`);
  assert.match(greet.body, /<Gather input="speech" language="en-AU" transcriptionEngine="Azure" region="australiaeast"/);
  assert.match(greet.body, /action="https:\/\/[^"]+\/api\/webhooks\/telnyx\/voice\/turn"/);
  assert.match(greet.body, /<\/Gather><Redirect method="POST">https:\/\/[^<]+\/api\/webhooks\/telnyx\/voice\/turn<\/Redirect>/);
  assert.match(greet.body, /automated assistant/, "greeting says it's an automated assistant");
  const row = await db.phoneCall.findUniqueOrThrow({ where: { callSid } });
  assert.equal(row.fromPhone, "0400000124");

  // The Redirect after Gather posts with no SpeechResult at all.
  const silent1 = await post("/api/webhooks/telnyx/voice/turn", { CallSid: callSid });
  assert.match(silent1.body, /Are you still there\?.*<\/Gather>/);
  const silent2 = await post("/api/webhooks/telnyx/voice/turn", { CallSid: callSid, SpeechResult: "" });
  assert.match(silent2.body, /<Hangup\/>/, "two silences end the call");

  const end = await post("/api/webhooks/telnyx/voice/status", { CallSid: callSid, CallStatus: "completed" });
  assert.equal(end.status, 204);
  const again = await post("/api/webhooks/telnyx/voice/status", { CallSid: callSid, CallStatus: "completed" });
  assert.equal(again.status, 204);
  const ended = await db.phoneCall.findUniqueOrThrow({ where: { callSid } });
  assert.ok(ended.endedAt, "end time recorded");
  assert.equal(ended.teamNotified, true, "missed-call email sent (once) for a call with no booking");

  const smsForged = await post("/api/webhooks/telnyx/sms", { data: { event_type: "message.received" } }, { json: true, badSig: true });
  assert.equal(smsForged.status, 403, "SMS webhook checks signatures");
  const receipt = await post("/api/webhooks/telnyx/sms", { data: { event_type: "message.finalized", payload: {} } }, { json: true });
  assert.equal(receipt.status, 200, "delivery reports are accepted and ignored");
  const stop = await post(
    "/api/webhooks/telnyx/sms",
    { data: { event_type: "message.received", payload: { from: { phone_number: from }, text: "STOP" } } },
    { json: true },
  );
  assert.equal(stop.status, 200, "opt-out keywords are left to Telnyx");

  await db.phoneCall.delete({ where: { callSid } });
  await db.$disconnect();
  console.log("PASS phone webhooks: signatures, replay guard, greeting, silence hang-up, missed-call email, SMS events");
}

if (process.argv.includes("--public-key")) {
  console.log(publicKeyB64);
} else {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
