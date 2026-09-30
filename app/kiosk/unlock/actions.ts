"use server";

import bcrypt from "bcryptjs";
import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import { KIOSK_COOKIE, verifyKioskToken } from "@/lib/kiosk";

/**
 * Takes the tablet out of client mode: the signed-in staff member re-enters
 * their own password. Returns where to go next (the booking they handed over).
 */
export async function unlockTablet(password: string): Promise<{ url?: string; error?: string }> {
  const session = await auth();
  if (!session?.user || (session.user.role !== "STAFF" && session.user.role !== "ADMIN")) {
    return { error: "No staff member is signed in on this device." };
  }
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const rl = rateLimit(`kiosk-unlock:${session.user.id}:${ip}`, 8, 60_000);
  if (!rl.allowed) return { error: `Too many tries. Please wait ${rl.retryAfterSec} seconds.` };

  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { passwordHash: true } });
  const ok = !!user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) {
    await audit({ userId: session.user.id, action: "KIOSK_UNLOCK_FAILED" });
    return { error: "That password isn't right." };
  }

  const jar = await cookies();
  const t = verifyKioskToken(jar.get(KIOSK_COOKIE)?.value ?? "");
  jar.delete(KIOSK_COOKIE);
  await audit({ userId: session.user.id, action: "KIOSK_UNLOCK", resource: t ? `Booking:${t.bookingId}` : undefined });
  return { url: t ? `/staff/bookings/${t.bookingId}` : "/staff/schedule" };
}
