// "Yes, I'm coming" confirmations from the day-before reminder.
//
// Email: the reminder links to /confirm-booking/<token>. The token is the
// booking id plus an HMAC (AUTH_SECRET), so it can't be guessed or pointed at
// someone else's booking. The page needs a button press (not the GET) so mail
// link scanners can't confirm on the client's behalf.
// SMS: a "C" reply reaches /api/webhooks/twilio/sms, which confirms the
// sender's next upcoming booking.

import crypto from "node:crypto";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { CLINIC } from "@/lib/clinic";

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function sign(bookingId: string): string {
  return crypto
    .createHmac("sha256", secret())
    .update(`booking-confirm:${bookingId}`)
    .digest("base64url")
    .slice(0, 22);
}

export function bookingConfirmToken(bookingId: string): string {
  return `${bookingId}.${sign(bookingId)}`;
}

export function bookingConfirmUrl(bookingId: string): string {
  return `${CLINIC.domain}/confirm-booking/${bookingConfirmToken(bookingId)}`;
}

/** Returns the booking id when the token is genuine, otherwise null. */
export function verifyBookingConfirmToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(id);
  if (sig.length !== expected.length) return null;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? id : null;
}

export type ConfirmOutcome =
  | { ok: true; startsAt: Date; serviceName: string; already: boolean }
  | { ok: false; reason: "not-found" | "not-active" | "past" };

/** Marks the booking as confirmed by the client. Idempotent. */
export async function confirmBookingByClient(
  bookingId: string,
  via: "EMAIL" | "SMS",
): Promise<ConfirmOutcome> {
  const b = await db.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      startsAt: true,
      clientId: true,
      clientConfirmedAt: true,
      service: { select: { name: true } },
    },
  });
  if (!b) return { ok: false, reason: "not-found" };
  if (b.status !== "PENDING" && b.status !== "CONFIRMED") return { ok: false, reason: "not-active" };
  if (b.startsAt.getTime() < Date.now()) return { ok: false, reason: "past" };
  if (b.clientConfirmedAt) {
    return { ok: true, startsAt: b.startsAt, serviceName: b.service.name, already: true };
  }
  await db.booking.update({
    where: { id: b.id },
    data: { clientConfirmedAt: new Date(), clientConfirmedVia: via },
  });
  await audit({
    userId: b.clientId,
    action: "BOOKING_CLIENT_CONFIRMED",
    resource: `Booking:${b.id}`,
    metadata: { via },
  });
  return { ok: true, startsAt: b.startsAt, serviceName: b.service.name, already: false };
}
