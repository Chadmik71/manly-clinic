import type { ModelMessage } from "ai";
import { GREETING } from "./prompt";

export type CallLine = { kind: "caller" | "assistant" | "action"; text: string };

export type CallOutcome = "Booked" | "Message taken" | "Missed call email" | "No action" | "In progress";

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const str = (v: unknown) => (typeof v === "string" ? v : "");

function parse(transcript: string | null): ModelMessage[] {
  if (!transcript) return [];
  try {
    const parsed = JSON.parse(transcript);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function describeAction(toolName: string, input: Rec, output: Rec): string {
  switch (toolName) {
    case "find_times": {
      if (output.ok === false) return `Looked up free times on ${str(input.date)}: ${str(output.error) || "failed"}`;
      const times = Array.isArray(output.times) ? output.times.join(", ") : "";
      return `Looked up free times on ${str(input.date)}: ${times || "none free"}`;
    }
    case "book_appointment":
      return output.ok === false
        ? `Booking not made: ${str(output.error) || "unknown reason"}`
        : `Booked ${str(output.summary)} (${str(output.reference)})`;
    case "take_message":
      return `Emailed the team a message from ${str(input.name)} (${str(input.phone)}): "${str(input.message)}"`;
    case "end_call":
      return "Hung up";
    default:
      return toolName;
  }
}

/** The stored conversation as lines a person can read, starting with the greeting. */
export function readableTranscript(transcript: string | null): CallLine[] {
  const lines: CallLine[] = [{ kind: "assistant", text: GREETING }];
  const inputs = new Map<string, Rec>();
  for (const m of parse(transcript)) {
    if (m.role === "user") {
      const text = typeof m.content === "string" ? m.content : m.content.map((p) => (p.type === "text" ? p.text : "")).join(" ");
      if (text.trim()) lines.push({ kind: "caller", text: text.trim() });
    } else if (m.role === "assistant") {
      if (typeof m.content === "string") {
        if (m.content.trim()) lines.push({ kind: "assistant", text: m.content.trim() });
        continue;
      }
      for (const p of m.content) {
        if (p.type === "text" && p.text.trim()) lines.push({ kind: "assistant", text: p.text.trim() });
        if (p.type === "tool-call") inputs.set(p.toolCallId, rec(p.input));
      }
    } else if (m.role === "tool") {
      for (const p of m.content) {
        if (p.type !== "tool-result") continue;
        const output = rec(rec(p.output).value);
        lines.push({ kind: "action", text: describeAction(p.toolName, inputs.get(p.toolCallId) ?? {}, output) });
      }
    }
  }
  return lines;
}

export function callOutcome(call: {
  bookingRefs: string | null;
  teamNotified: boolean;
  endedAt: Date | null;
  transcript: string | null;
}): CallOutcome {
  if (call.bookingRefs) return "Booked";
  const tookMessage = parse(call.transcript).some(
    (m) => m.role === "tool" && m.content.some((p) => p.type === "tool-result" && p.toolName === "take_message"),
  );
  if (tookMessage) return "Message taken";
  if (call.teamNotified) return "Missed call email";
  return call.endedAt ? "No action" : "In progress";
}

export function callLength(call: { createdAt: Date; endedAt: Date | null }): string {
  if (!call.endedAt) return "";
  const sec = Math.max(0, Math.round((call.endedAt.getTime() - call.createdAt.getTime()) / 1000));
  return sec < 60 ? `${sec} s` : `${Math.floor(sec / 60)} min ${sec % 60} s`;
}
