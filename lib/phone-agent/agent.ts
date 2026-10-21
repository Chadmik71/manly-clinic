import { generateText, isStepCount, tool, type LanguageModel, type ModelMessage } from "ai";
import { z } from "zod";
import { db } from "@/lib/db";
import { notifyClinicPhoneMessage } from "@/lib/notify";
import { bookAppointment, findTimes, phoneServiceCatalogue } from "./booking";
import { phoneAgentInstructions } from "./prompt";

// Claude Haiku answers fast enough for a phone turn. Inference is pinned to
// an Australian data centre with zero data retention (the gateway fails the
// request rather than run it elsewhere; see Vercel's regional inference docs).
const MODEL = "anthropic/claude-haiku-5.5";
const GATEWAY_OPTIONS = {
  gateway: {
    inferenceRegion: { scope: "zone", geoRegion: "au" },
    zeroDataRetention: true,
  },
};

export type TurnResult = { say: string; hangUp: boolean };

/**
 * One back-and-forth on a call: the caller said `callerText`, the model may
 * call tools (find times, book, take a message), and we return what to say.
 * The conversation so far lives on the PhoneCall row between turns.
 */
export async function runPhoneTurn(args: {
  callSid: string;
  callerPhone: string | null;
  callerText: string;
  history: ModelMessage[];
  model?: LanguageModel;
}): Promise<{ result: TurnResult; history: ModelMessage[] }> {
  let hangUp = false;

  const tools = {
    find_times: tool({
      description:
        "List free start times (24h HH:mm, Sydney time) for one service at one length on one day. Call before offering times.",
      inputSchema: z.object({
        serviceSlug: z.string().describe("slug from the services list"),
        durationMin: z.number().int(),
        date: z.string().describe("YYYY-MM-DD"),
      }),
      execute: (input) => findTimes(input),
    }),
    book_appointment: tool({
      description:
        "Book the appointment. Only after the caller has clearly said yes to the read-back of service, length, day, time and price.",
      inputSchema: z.object({
        serviceSlug: z.string(),
        durationMin: z.number().int(),
        date: z.string().describe("YYYY-MM-DD"),
        time: z.string().describe("HH:mm, 24h, Sydney time, one of the find_times results"),
        name: z.string().describe("client's full name"),
        phone: z.string().describe("client's Australian phone number, digits only"),
      }),
      execute: (input) => bookAppointment({ ...input, callSid: args.callSid, callerPhone: args.callerPhone }),
    }),
    take_message: tool({
      description:
        "Email a message to the clinic team, who will call back. Use for anything you can't do yourself.",
      inputSchema: z.object({
        name: z.string(),
        phone: z.string(),
        message: z.string().describe("what they need, in a sentence or two, with no health details"),
      }),
      execute: async (input) => {
        await notifyClinicPhoneMessage({ ...input, callerId: args.callerPhone });
        await db.phoneCall.update({ where: { callSid: args.callSid }, data: { teamNotified: true } });
        return { ok: true };
      },
    }),
    end_call: tool({
      description: "Hang up after your goodbye. Use once the caller has nothing else.",
      inputSchema: z.object({}),
      execute: async () => {
        hangUp = true;
        return { ok: true };
      },
    }),
  };

  const messages: ModelMessage[] = [...args.history, { role: "user", content: args.callerText }];
  const result = await generateText({
    model: args.model ?? MODEL,
    instructions: phoneAgentInstructions({
      services: await phoneServiceCatalogue(),
      now: new Date(),
      callerPhone: args.callerPhone,
    }),
    messages,
    tools,
    stopWhen: [isStepCount(6), () => hangUp],
    maxOutputTokens: 300,
    // Twilio drops the call if the webhook takes ~15s; fail first so the
    // caller hears an apology and the team gets an email instead.
    abortSignal: AbortSignal.timeout(11_000),
    providerOptions: GATEWAY_OPTIONS,
  });

  // The goodbye is often spoken in the same step as a tool call, so join
  // every step's text rather than taking only the last.
  const spoken = result.steps.map((s) => s.text.trim()).filter(Boolean).join(" ");
  const say = spoken || (hangUp ? "Thanks for calling. Bye for now." : "Sorry, could you say that again?");
  return { result: { say, hangUp }, history: [...messages, ...result.responseMessages] };
}
