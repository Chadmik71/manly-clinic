import { CLINIC } from "@/lib/clinic";

// TeXML (Telnyx's call script, same shape as Twilio's TwiML).
// Speech recognition is Microsoft Azure in its Australia East (Sydney) data
// centre, chosen on every <Gather> so caller audio is transcribed onshore.

const VOICE = `voice="Polly.Olivia-Neural"`;
const LISTEN = `input="speech" language="en-AU" transcriptionEngine="Azure" region="australiaeast" timeout="6" speechTimeout="1"`;
export const TURN_PATH = "/api/webhooks/telnyx/voice/turn";
const TURN_URL = `${CLINIC.domain}${TURN_PATH}`;

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function texml(inner: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    headers: { "content-type": "text/xml" },
  });
}

function say(text: string): string {
  return `<Say ${VOICE}>${xmlEscape(text)}</Say>`;
}

/** Speak, then listen for the caller's reply (posted to the turn route).
 *  If they say nothing, the Redirect posts to the same route with no speech. */
export function speakAndListen(text: string): Response {
  return texml(
    `<Gather ${LISTEN} action="${TURN_URL}" method="POST">${say(text)}</Gather><Redirect method="POST">${TURN_URL}</Redirect>`,
  );
}

export function speakAndHangUp(text: string): Response {
  return texml(`${say(text)}<Hangup/>`);
}
