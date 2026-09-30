"use server";

import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { KIOSK_COOKIE, KIOSK_LOCK_HOURS, kioskToken } from "@/lib/kiosk";

/**
 * "Hand to client": locks this device to the client-only health form for
 * one booking and returns the address to open. See lib/kiosk.ts.
 */
export async function startClientMode(bookingId: string): Promise<{ url?: string; error?: string }> {
  const session = await auth();
  if (!session?.user || (session.user.role !== "STAFF" && session.user.role !== "ADMIN")) {
    return { error: "Forbidden." };
  }
  const b = await db.booking.findUnique({ where: { id: bookingId }, select: { id: true, status: true } });
  if (!b) return { error: "Booking not found." };
  if (b.status !== "PENDING" && b.status !== "CONFIRMED") {
    return { error: "This booking is no longer upcoming." };
  }
  const token = kioskToken(b.id);
  (await cookies()).set(KIOSK_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: KIOSK_LOCK_HOURS * 3600,
  });
  await audit({ userId: session.user.id, action: "KIOSK_HAND_TO_CLIENT", resource: `Booking:${b.id}` });
  return { url: `/kiosk/${token}` };
}
