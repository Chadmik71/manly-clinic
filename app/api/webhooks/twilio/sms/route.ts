import crypto from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { CLINIC } from "@/lib/clinic";
import { normalisePhone } from "@/lib/phone";
import { confirmBookingByClient } from "@/lib/booking-confirm";
import { notifyClinicSmsReply, smsTime } from "@/lib/notify";

// Incoming texts to the clinic's Twilio number (set this URL as the number's
// "A message comes in" webhook: https://<domain>/api/webhooks/twilio/sms).
//
// "C" / "YES" confirms the sender's next booking in the coming 2 days (the
// reminder goes out the evening before). Anything else is emailed to the
// clinic. Twilio itself handles STOP / START / HELP opt-out keywords.
//
// Every request must carry a valid X-Twilio-Signature (HMAC-SHA1 of the URL +
// sorted POST params, keyed with TWILIO_AUTH_TOKEN); without the token set the
// route refuses everything.

const CONFIRM_WORDS = new Set(["c", "confirm", "confirmed", "y", "yes", "ok", "okay"]);
const TWILIO_KEYWORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "start", "unstop", "help", "info"]);

function twiml(message?: string): Response {
  const body = message
    ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new Response(body, { headers: { "content-type": "text/xml" } });
}

function expectedSignature(url: string, params: URLSearchParams, token: string): string {
  const keys = [...new Set(params.keys())].sort();
  let data = url;
  for (const k of keys) for (const v of params.getAll(k)) data += k + v;
  return crypto.createHmac("sha1", token).update(data).digest("base64");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export async function POST(req: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return new Response("SMS not configured", { status: 503 });

  const raw = await req.text();
  const params = new URLSearchParams(raw);
  const sig = req.headers.get("x-twilio-signature") ?? "";

  // Twilio signs the exact public URL it called. Behind Vercel req.url is
  // normally that URL; also accept the canonical domain in case of a proxy hop.
  const path = new URL(req.url).pathname;
  const candidates = [req.url, `${CLINIC.domain}${path}`];
  if (!sig || !candidates.some((u) => safeEqual(sig, expectedSignature(u, params, token)))) {
    return new Response("Invalid signature", { status: 403 });
  }

  const from = normalisePhone(params.get("From"));
  const text = (params.get("Body") ?? "").trim();
  const word = text.toLowerCase().replace(/[^a-z]/g, "");
  if (!from) return twiml();
  if (TWILIO_KEYWORDS.has(word)) return twiml();

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
      return twiml(`${CLINIC.name}: we couldn't find an upcoming booking for this number. Please call ${CLINIC.phone}.`);
    }
    const res = await confirmBookingByClient(next.id, "SMS");
    if (res.ok) {
      return twiml(`${CLINIC.name}: thanks, you're confirmed for ${smsTime(next.startsAt)}. See you then!`);
    }
    return twiml(`${CLINIC.name}: please call ${CLINIC.phone} about your booking.`);
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
  return twiml(`${CLINIC.name}: thanks, we've passed your message on. For anything urgent please call ${CLINIC.phone}.`);
}
