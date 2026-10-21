import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { CLINIC } from "@/lib/clinic";
import { readTelnyxRequest } from "@/lib/telnyx-webhook";
import { normalisePhone } from "@/lib/phone";
import { confirmBookingByClient } from "@/lib/booking-confirm";
import { notifyClinicSmsReply, sendSms, smsTime } from "@/lib/notify";

// Incoming texts to the clinic's Telnyx number (set this URL as the messaging
// profile's webhook: https://<domain>/api/webhooks/telnyx/sms).
//
// "C" / "YES" confirms the sender's next booking in the coming 2 days (the
// reminder goes out the evening before). Anything else is emailed to the
// clinic. Telnyx itself handles STOP / START / HELP opt-out keywords.
//
// The same webhook also receives delivery reports for texts we send
// (message.sent, message.finalized); only message.received is acted on.

const CONFIRM_WORDS = new Set(["c", "confirm", "confirmed", "y", "yes", "ok", "okay"]);
const OPT_OUT_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "start", "unstop", "help", "info"]);

type MessageEvent = {
  data?: { event_type?: string; payload?: { from?: { phone_number?: string }; text?: string } };
};

const done = () => new Response(null, { status: 200 });

export async function POST(req: Request) {
  const checked = await readTelnyxRequest(req);
  if (!checked.ok) return checked.response;

  let event: MessageEvent;
  try {
    event = JSON.parse(checked.body);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  if (event.data?.event_type !== "message.received") return done();

  const from = normalisePhone(event.data.payload?.from?.phone_number);
  const text = (event.data.payload?.text ?? "").trim();
  const word = text.toLowerCase().replace(/[^a-z]/g, "");
  if (!from || OPT_OUT_KEYWORDS.has(word)) return done();
  const reply = async (body: string) => {
    await sendSms({ to: from, body });
    return done();
  };

  // Phones typed in by staff may be stored with spaces ("0412 345 678"), so
  // compare normalised numbers across the (few) bookings in the next 2 days.
  const now = new Date();
  const soon = await db.booking.findMany({
    where: {
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: { gt: now, lt: new Date(now.getTime() + 48 * 3600 * 1000) },
      client: { phone: { not: null } },
    },
    orderBy: { startsAt: "asc" },
    select: {
      id: true,
      startsAt: true,
      client: { select: { name: true, phone: true } },
      service: { select: { name: true } },
    },
  });
  const next = soon.find((b) => normalisePhone(b.client.phone) === from) ?? null;

  if (CONFIRM_WORDS.has(word)) {
    if (!next) {
      return reply(`${CLINIC.name}: we couldn't find an upcoming booking for this number. Please call ${CLINIC.phone}.`);
    }
    const res = await confirmBookingByClient(next.id, "SMS");
    if (res.ok) {
      return reply(`${CLINIC.name}: thanks, you're confirmed for ${smsTime(next.startsAt)}. See you then!`);
    }
    return reply(`${CLINIC.name}: please call ${CLINIC.phone} about your booking.`);
  }

  // Any other reply: forward to the clinic so a person can answer it.
  const anyClient = next
    ? null
    : await db.user.findFirst({ where: { phone: from, role: "CLIENT" }, select: { name: true } });
  await notifyClinicSmsReply({
    fromPhone: from,
    clientName: next?.client.name ?? anyClient?.name ?? null,
    body: text.slice(0, 1000),
    nextBooking: next ? `${next.service.name}, ${smsTime(next.startsAt)}` : null,
  });
  await audit({
    userId: null,
    action: "SMS_REPLY_FORWARDED",
    resource: next ? `Booking:${next.id}` : undefined,
    metadata: { from },
  });
  return reply(`${CLINIC.name}: thanks, we've passed your message on. For anything urgent please call ${CLINIC.phone}.`);
}
