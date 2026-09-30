// "Hand to client" mode for the shop tablet.
//
// Staff press "Hand to client" on a booking; the tablet opens /kiosk/<token>,
// a bare page with ONLY that booking's health form. The token is the booking
// id + an expiry, signed with AUTH_SECRET, so it can't be pointed at another
// booking and stops working after KIOSK_MINUTES.
//
// While the tablet is handed over, the KIOSK_COOKIE lock makes proxy.ts send
// every staff/portal/API request back to the form (so back buttons, new tabs
// or typed addresses can't reach other clients). Staff remove the lock at
// /kiosk/unlock by re-entering their own password.

import crypto from "node:crypto";

export const KIOSK_COOKIE = "mrt_kiosk";
export const KIOSK_MINUTES = 30;
/** How long the tablet lock lasts if nobody unlocks it (it only ever blocks
 *  staff pages; the client can't do anything with it). */
export const KIOSK_LOCK_HOURS = 12;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(`kiosk:${payload}`).digest("base64url").slice(0, 22);
}

export function kioskToken(bookingId: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + KIOSK_MINUTES * 60;
  const payload = `${bookingId}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

/** Null when forged/garbled. `expired` is true once the time limit passes. */
export function verifyKioskToken(token: string): { bookingId: string; expired: boolean } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [bookingId, expStr, sig] = parts;
  const expected = sign(`${bookingId}.${expStr}`);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp)) return null;
  return { bookingId, expired: Date.now() / 1000 > exp };
}
