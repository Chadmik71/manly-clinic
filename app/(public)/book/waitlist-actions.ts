"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { normalisePhone, isAuMobile } from "@/lib/phone";
import { getClinicSettingsSafe } from "@/lib/clinic-settings";

const schema = z.object({
  serviceId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().min(1).max(40),
  consent: z.literal("on"),
});

export type JoinWaitlistResult = { ok: true } | { ok: false; error: string };

/**
 * Public, unauthenticated (or optionally signed-in) form on the booking
 * page's "day is full" empty state. Best-effort: never touches an existing
 * Booking, just records interest and lets matchAndNotifyWaitlist() (called
 * from the 3 cancellation/no-show sites) reach out later.
 */
export async function joinWaitlist(fd: FormData): Promise<JoinWaitlistResult> {
  const settings = await getClinicSettingsSafe();
  if (!settings.waitlistEnabled) {
    return { ok: false, error: "The waitlist isn't available right now." };
  }

  // Server actions don't get a Request object, so build the rate-limit key
  // straight from headers() rather than lib/rate-limit's Request-based
  // getClientIp().
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    "unknown";
  const rl = rateLimit(`waitlist:${ip}`, RATE_LIMITS.waitlist.limit, RATE_LIMITS.waitlist.windowMs);
  if (!rl.allowed) {
    return { ok: false, error: "Too many requests. Please try again shortly." };
  }

  const raw: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string") raw[k] = v;
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Please fill in all fields and tick the consent box." };
  }
  const data = parsed.data;

  const phone = normalisePhone(data.phone);
  if (!isAuMobile(phone)) {
    return { ok: false, error: "Please enter a valid Australian mobile number." };
  }

  const service = await db.service.findUnique({
    where: { id: data.serviceId },
    select: { id: true, active: true },
  });
  if (!service || !service.active) {
    return { ok: false, error: "That treatment isn't available." };
  }

  const session = await auth();

  const created = await db.waitlistEntry.create({
    data: {
      date: data.date,
      serviceId: data.serviceId,
      clientId: session?.user?.id ?? null,
      guestName: data.name,
      guestEmail: data.email.toLowerCase(),
      guestPhone: phone,
    },
  });

  await audit({
    userId: session?.user?.id ?? null,
    action: "JOIN_WAITLIST",
    resource: `WaitlistEntry:${created.id}`,
    metadata: { date: data.date, serviceId: data.serviceId, guest: !session?.user },
  });

  return { ok: true };
}
