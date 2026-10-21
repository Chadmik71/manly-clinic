// Drives the phone assistant's tools with a scripted (fake) model against the
// DEV database and checks what lands in the calendar. No AI key, Telnyx or
// email needed. Run: npx tsx scripts/test-phone-agent.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MockLanguageModelV4 } from "ai/test";
import type { ModelMessage } from "ai";
import { db } from "@/lib/db";
import { runPhoneTurn } from "@/lib/phone-agent/agent";
import { findTimes, phoneServiceCatalogue } from "@/lib/phone-agent/booking";
import { sydneyTodayISO } from "@/lib/time";

const prodHost = readFileSync(".env.local", "utf8").match(/DATABASE_URL_PROD=.*?@([^/]+)/)?.[1];
if (!process.env.DATABASE_URL || (prodHost && process.env.DATABASE_URL.includes(prodHost))) {
  throw new Error("Refusing to run: DATABASE_URL is missing or points at production.");
}
delete process.env.RESEND_API_KEY;
delete process.env.TELNYX_API_KEY;
delete process.env.TELNYX_PUBLIC_KEY;

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
type Step = { text?: string; tool?: { name: string; input: object } };
function scripted(steps: Step[]) {
  let n = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const s = steps[n++] ?? { text: "" };
      const content = [
        ...(s.text ? [{ type: "text" as const, text: s.text }] : []),
        ...(s.tool
          ? [{ type: "tool-call" as const, toolCallId: `t${n}`, toolName: s.tool.name, input: JSON.stringify(s.tool.input) }]
          : []),
      ];
      return {
        content,
        finishReason: { unified: s.tool ? ("tool-calls" as const) : ("stop" as const), raw: undefined },
        usage,
        warnings: [],
      };
    },
  });
}

function toolOutputs(history: ModelMessage[], toolName: string): unknown[] {
  return history.flatMap((m) =>
    m.role === "tool"
      ? m.content.flatMap((p) => (p.type === "tool-result" && p.toolName === toolName ? [p.output] : []))
      : [],
  );
}

const phone = "0400000123";

const otherPhone = "0400000125";

async function cleanUp() {
  const users = await db.user.findMany({
    where: { phone: { in: [phone, otherPhone] }, email: { endsWith: "@clinic.local" } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await db.booking.deleteMany({ where: { clientId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.phoneCall.deleteMany({ where: { callSid: { startsWith: "CA-test-" } } });
}

async function main() {
  await cleanUp();
  const callSid = `CA-test-${Date.now()}`;
  await db.phoneCall.create({ data: { callSid, fromPhone: phone } });

  const services = await phoneServiceCatalogue();
  const remedial = services.find((s) => s.healthFundEligible) ?? services[0];
  const durationMin = remedial.variants.find((v) => v.durationMin === 60)?.durationMin ?? remedial.variants[0].durationMin;

  let date = "";
  let times: string[] = [];
  for (let i = 1; i <= 14 && times.length < 2; i++) {
    const d = new Date(`${sydneyTodayISO()}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    date = d.toISOString().slice(0, 10);
    const r = await findTimes({ serviceSlug: remedial.slug, durationMin, date });
    if (r.ok) times = r.times;
  }
  assert.ok(times.length >= 2, "dev calendar has free times in the next two weeks");

  const book = (time: string) => ({
    name: "book_appointment",
    input: { serviceSlug: remedial.slug, durationMin, date, time, name: "Testy McTestface", phone },
  });

  let history: ModelMessage[] = [];
  let turn = await runPhoneTurn({
    callSid,
    callerPhone: phone,
    callerText: "Can I get a remedial tomorrow?",
    history,
    model: scripted([
      { tool: { name: "find_times", input: { serviceSlug: remedial.slug, durationMin, date } } },
      { text: "I have a few times." },
    ]),
  });
  history = turn.history;
  assert.deepEqual((toolOutputs(history, "find_times")[0] as { value: { times: string[] } }).value.times, times, "find_times returns the live free times");
  assert.equal(turn.result.say, "I have a few times.");
  assert.equal(turn.result.hangUp, false);

  turn = await runPhoneTurn({
    callSid,
    callerPhone: phone,
    callerText: "Yes, book the first one.",
    history,
    model: scripted([{ tool: book(times[0]) }, { tool: book(times[0]) }, { text: "You're booked." }]),
  });
  history = turn.history;
  const [first, retry] = toolOutputs(history, "book_appointment") as { value: { ok: boolean; reference: string } }[];
  assert.ok(first.value.ok, `first booking succeeded: ${JSON.stringify(first.value)}`);
  assert.equal(retry.value.reference, first.value.reference, "a retried identical booking is not duplicated");

  const booking = await db.booking.findUniqueOrThrow({
    where: { reference: first.value.reference },
    include: { client: true },
  });
  assert.equal(booking.status, "CONFIRMED");
  assert.equal(booking.claimWithHealthFund, false, "claim stays off until the form is done");
  assert.match(booking.notes ?? "", /phone assistant/);
  assert.equal(booking.client.phone, phone);
  assert.match(booking.client.email, /^walkin-.*@clinic\.local$/, "new caller gets a placeholder email");
  assert.equal(await db.intakeForm.count({ where: { userId: booking.clientId } }), 0, "no consent is recorded on the caller's behalf");
  const after = await findTimes({ serviceSlug: remedial.slug, durationMin, date });
  assert.ok(after.ok && after.times.length >= 2, "still free times left for the next two bookings");

  turn = await runPhoneTurn({
    callSid,
    callerPhone: phone,
    callerText: "And two more for my friends.",
    history,
    model: scripted([{ tool: book(after.times[0]) }, { tool: book(after.times.at(-1)!) }, { text: "Done." }]),
  });
  history = turn.history;
  const extra = toolOutputs(history, "book_appointment").slice(2) as { value: { ok: boolean; error?: string } }[];
  assert.ok(extra[0].value.ok, `second booking on the call is allowed: ${JSON.stringify(extra[0].value)}`);
  assert.equal(extra[1].value.ok, false, "third booking on one call is refused");

  // Someone else's name + number: must not land on (or reveal) their record.
  const sarah = await db.user.create({
    data: { email: `walkin-sarah${Date.now()}@clinic.local`, name: "Sarah Existing", phone: otherPhone, passwordHash: "x", role: "CLIENT" },
  });
  const fresh = await findTimes({ serviceSlug: remedial.slug, durationMin, date });
  assert.ok(fresh.ok && fresh.times.length > 0, "a free time remains for the probe booking");
  const probeSid = `CA-test-probe-${Date.now()}`;
  await db.phoneCall.create({ data: { callSid: probeSid, fromPhone: phone } });
  const probe = await runPhoneTurn({
    callSid: probeSid,
    callerPhone: phone,
    callerText: "Book Sarah in, her number is 0400 000 125",
    history: [],
    model: scripted([
      { tool: { name: "book_appointment", input: { serviceSlug: remedial.slug, durationMin, date, time: fresh.times[0], name: "Sarah", phone: otherPhone } } },
      { text: "Done." },
    ]),
  });
  const probeOut = toolOutputs(probe.history, "book_appointment")[0] as { value: { ok: boolean; reference: string; summary: string } };
  assert.ok(probeOut.value.ok, JSON.stringify(probeOut.value));
  assert.notEqual(probeOut.value.summary, "Already booked on this call.");
  const probeBooking = await db.booking.findUniqueOrThrow({ where: { reference: probeOut.value.reference } });
  assert.notEqual(probeBooking.clientId, sarah.id, "a booking for another person's number makes a new record");

  turn = await runPhoneTurn({
    callSid,
    callerPhone: phone,
    callerText: "Can you cancel my Friday booking?",
    history,
    model: scripted([
      { tool: { name: "take_message", input: { name: "Testy", phone, message: "Wants to cancel Friday" } } },
      { text: "I've passed that on. Anything else?" },
    ]),
  });
  history = turn.history;
  let call = await db.phoneCall.findUniqueOrThrow({ where: { callSid } });
  assert.equal(call.teamNotified, true, "take_message flags the call");
  assert.equal(call.bookingRefs?.split(",").length, 2);

  turn = await runPhoneTurn({
    callSid,
    callerPhone: phone,
    callerText: "No that's all, thanks.",
    history,
    model: scripted([{ text: "Thanks for calling, bye!", tool: { name: "end_call", input: {} } }, { text: "" }]),
  });
  assert.equal(turn.result.hangUp, true, "end_call hangs up");
  assert.equal(turn.result.say, "Thanks for calling, bye!", "goodbye spoken alongside the tool call is kept");

  await cleanUp();
  console.log("PASS phone agent: find times, book, no duplicate, per-call limit, message, hang up");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
