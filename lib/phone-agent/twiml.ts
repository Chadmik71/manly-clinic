import { twimlResponse, xmlEscape } from "@/lib/twilio-webhook";

// Australian neural voice; Twilio speech recognition tuned for phone audio.
const VOICE = `voice="Polly.Olivia-Neural" language="en-AU"`;
export const TURN_PATH = "/api/webhooks/twilio/voice/turn";

const HINTS = [
  "remedial",
  "Thai massage",
  "relaxation",
  "deep tissue",
  "aromatherapy",
  "hot stone",
  "reflexology",
  "cupping",
  "pregnancy massage",
  "HICAPS",
  "health fund",
].join(",");

function say(text: string): string {
  return `<Say ${VOICE}>${xmlEscape(text)}</Say>`;
}

/** Speak, then listen for the caller's reply (posted to the turn route). */
export function speakAndListen(text: string): Response {
  return twimlResponse(
    `<Gather input="speech" action="${TURN_PATH}" method="POST" language="en-AU" speechModel="phone_call" enhanced="true" speechTimeout="auto" actionOnEmptyResult="true" hints="${xmlEscape(HINTS)}">${say(text)}</Gather>`,
  );
}

export function speakAndHangUp(text: string): Response {
  return twimlResponse(`${say(text)}<Hangup/>`);
}
