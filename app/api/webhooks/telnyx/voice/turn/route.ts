import type { ModelMessage } from "ai";
import { db } from "@/lib/db";
import { CLINIC } from "@/lib/clinic";
import { notifyClinicUnfinishedCall } from "@/lib/notify";
import { readTelnyxRequest } from "@/lib/telnyx-webhook";
import { runPhoneTurn } from "@/lib/phone-agent/agent";
import { speakAndHangUp, speakAndListen } from "@/lib/phone-agent/texml";

// Each time the caller finishes speaking, Telnyx posts what they said here
// (SpeechResult) and plays back whatever we answer.

export const maxDuration = 60;

const MAX_TURNS = 30;
const MAX_SILENT_TURNS = 2;
const WEBSITE = CLINIC.domain.replace("https://www.", "");

export async function POST(req: Request) {
  const checked = await readTelnyxRequest(req);
  if (!checked.ok) return checked.response;
  const params = new URLSearchParams(checked.body);
  const callSid = params.get("CallSid");
  if (!callSid) return new Response("Missing CallSid", { status: 400 });

  const call = await db.phoneCall.findUnique({ where: { callSid } });
  if (!call) return speakAndHangUp("Sorry, something went wrong. Please call back.");

  const heard = (params.get("SpeechResult") ?? "").trim();
  if (!heard) {
    const silentTurns = call.silentTurns + 1;
    await db.phoneCall.update({ where: { callSid }, data: { silentTurns } });
    return silentTurns >= MAX_SILENT_TURNS
      ? speakAndHangUp(`I didn't catch anything, so I'll let you go. You can also book online at ${WEBSITE}. Bye for now.`)
      : speakAndListen("Sorry, I didn't catch that. Are you still there?");
  }

  if (call.turnCount >= MAX_TURNS) {
    return speakAndHangUp("I'll ask the team to call you back as soon as they're free. Thanks for calling.");
  }

  try {
    const history: ModelMessage[] = call.transcript ? JSON.parse(call.transcript) : [];
    const { result, history: next } = await runPhoneTurn({
      callSid,
      callerPhone: call.fromPhone,
      callerText: heard,
      history,
    });
    await db.phoneCall.update({
      where: { callSid },
      data: {
        transcript: JSON.stringify(next),
        turnCount: call.turnCount + 1,
        silentTurns: 0,
        ...(result.hangUp ? { endedAt: new Date() } : {}),
      },
    });
    return result.hangUp ? speakAndHangUp(result.say) : speakAndListen(result.say);
  } catch (e) {
    console.error("[phone-agent] turn failed", e);
    if (!call.teamNotified) {
      await notifyClinicUnfinishedCall({
        callerId: call.fromPhone,
        reason: "The phone assistant had a technical problem during this call.",
      });
      await db.phoneCall.update({ where: { callSid }, data: { teamNotified: true } });
    }
    return speakAndHangUp(
      `Sorry, I'm having trouble right now. I've let the team know you called, and they'll call you back. You can also book online at ${WEBSITE}.`,
    );
  }
}
