"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { saveBookingIntake } from "@/lib/booking-intake";
import { verifyKioskToken } from "@/lib/kiosk";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { CLINIC } from "@/lib/clinic";
import { notifyPortalInvite } from "@/lib/notify";
import { isPlaceholderEmail } from "@/lib/placeholder-email";
import { rateLimit } from "@/lib/rate-limit";
import { signResetToken } from "@/lib/reset-token";

/**
 * Health form submitted by the client on the shop tablet. Authorised by the
 * signed, time-limited kiosk token for this one booking (not by the staff
 * login that happens to be on the tablet).
 */
export async function submitKioskForm(
  token: string,
  bookingId: string,
  fd: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const t = verifyKioskToken(token);
  if (!t || t.bookingId !== bookingId) return { error: "This form link isn't valid. Please hand the tablet back to staff." };
  if (t.expired) return { error: "This form has timed out. Please hand the tablet back to staff." };

  const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { clientId: true, status: true } });
  if (!booking) return { error: "Booking not found." };
  if (booking.status !== "PENDING" && booking.status !== "CONFIRMED") {
    return { error: "This booking can no longer be updated. Please hand the tablet back to staff." };
  }

  const res = await saveBookingIntake({
    bookingId,
    fd,
    actorUserId: booking.clientId,
    who: "client",
    auditAction: "KIOSK_COMPLETE_BOOKING_INTAKE",
  });
  if (res.error) return res;
  revalidatePath(`/staff/bookings/${bookingId}`);
  revalidatePath("/staff/schedule");
  return { ok: true };
}

/**
 * End of the tablet form: the client asks for a link to set up their online
 * account. If no real email is on file they type it themselves (staff handed
 * them the tablet in person, so it's them); otherwise the link goes to the
 * email already on file. Same invite as the staff "Send online account invite".
 */
export async function kioskSendAccountLink(
  token: string,
  rawEmail?: string,
): Promise<{ ok?: boolean; error?: string; sentTo?: string }> {
  const t = verifyKioskToken(token);
  if (!t) return { error: "This form link isn't valid. Please ask staff." };
  if (t.expired) return { error: "This form has timed out. Please ask staff to set up your account." };

  const rl = rateLimit(`kiosk-invite:${t.bookingId}`, 3, 10 * 60_000);
  if (!rl.allowed) return { error: "Please wait a few minutes before trying again." };

  const booking = await db.booking.findUnique({
    where: { id: t.bookingId },
    select: { client: { select: { id: true, email: true, name: true, role: true, passwordHash: true } } },
  });
  const client = booking?.client;
  if (!client || client.role !== "CLIENT") return { error: "Please ask staff to set up your account." };

  let email = client.email;
  if (isPlaceholderEmail(client.email)) {
    const parsed = z.string().trim().toLowerCase().email().max(254).safeParse(rawEmail ?? "");
    if (!parsed.success || isPlaceholderEmail(parsed.data)) return { error: "Please enter a valid email address." };
    const taken = await db.user.findUnique({ where: { email: parsed.data }, select: { id: true } });
    if (taken && taken.id !== client.id) {
      return { error: "That email is already used on another record. Please ask staff to help." };
    }
    email = parsed.data;
    await db.user.update({ where: { id: client.id }, data: { email } });
    await audit({ userId: client.id, action: "KIOSK_SET_CLIENT_EMAIL", resource: `User:${client.id}` });
  }

  const resetToken = signResetToken(client.id, client.passwordHash, 72 * 60 * 60);
  await notifyPortalInvite({
    email,
    name: client.name || "there",
    link: `${CLINIC.domain}/reset-password?token=${encodeURIComponent(resetToken)}`,
    expiresHours: 72,
  });
  await audit({ userId: client.id, action: "KIOSK_SEND_PORTAL_INVITE", resource: `User:${client.id}` });
  return { ok: true, sentTo: maskEmail(email) };
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}${"*".repeat(Math.max(2, user.length - 1))}@${domain}`;
}
