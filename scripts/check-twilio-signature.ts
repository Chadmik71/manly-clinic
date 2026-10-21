// Checks the webhook signature rules without a server:
//   npx tsx scripts/check-twilio-signature.ts
import assert from "node:assert/strict";
import { readTwilioRequest, signTwilioRequest } from "@/lib/twilio-webhook";

const URL_ = "https://www.manlyremedialthai.com.au/api/webhooks/twilio/voice";
const params = new URLSearchParams({ CallSid: "CA123", From: "+61400000000" });

function req(token: string) {
  return new Request(URL_, {
    method: "POST",
    headers: { "x-twilio-signature": signTwilioRequest(URL_, params, token) },
    body: params.toString(),
  });
}

async function status(token: string) {
  const r = await readTwilioRequest(req(token));
  return r.ok ? 200 : r.response.status;
}

async function main() {
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_AU1_AUTH_TOKEN;
  assert.equal(await status("x"), 503, "no token set refuses everything");

  process.env.TWILIO_AUTH_TOKEN = "us1-token";
  assert.equal(await status("us1-token"), 200, "US1 token accepted");
  assert.equal(await status("au1-token"), 403, "unknown token refused");

  process.env.TWILIO_AU1_AUTH_TOKEN = "au1-token";
  assert.equal(await status("au1-token"), 200, "AU1 token accepted");
  assert.equal(await status("us1-token"), 200, "US1 token still accepted");
  assert.equal(await status("forged"), 403, "forged signature refused");

  delete process.env.TWILIO_AUTH_TOKEN;
  assert.equal(await status("au1-token"), 200, "AU1 token alone works");

  console.log("PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
