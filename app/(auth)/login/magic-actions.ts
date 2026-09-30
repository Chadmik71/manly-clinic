"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { CLINIC } from "@/lib/clinic";
import { notifyMagicLink } from "@/lib/notify";
import { isPlaceholderEmail } from "@/lib/placeholder-email";
import { MAGIC_LINK_MINUTES, safeNextPath, signMagicLinkToken } from "@/lib/magic-link";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/**
 * "Email me a sign-in link". Always answers the same way whether or not the
 * email has an account, so it can't be used to discover who's a client.
 */
export async function requestMagicLink(
  rawEmail: string,
  next: string,
): Promise<{ ok?: boolean; error?: string }> {
  const parsed = z.string().trim().toLowerCase().email().max(254).safeParse(rawEmail);
  if (!parsed.success) return { error: "Please enter a valid email address." };
  const email = parsed.data;

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const byIp = rateLimit(`magic:ip:${ip}`, RATE_LIMITS.magicLink.limit, RATE_LIMITS.magicLink.windowMs);
  const byEmail = rateLimit(`magic:email:${email}`, 3, RATE_LIMITS.magicLink.windowMs);
  if (!byIp.allowed || !byEmail.allowed) {
    return { error: "Too many requests. Please wait a few minutes and try again." };
  }

  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, name: true, role: true, email: true },
  });
  if (user && user.role === "CLIENT" && !isPlaceholderEmail(user.email)) {
    const token = signMagicLinkToken(user.id);
    const link = `${CLINIC.domain}/login/magic?token=${encodeURIComponent(token)}&next=${encodeURIComponent(safeNextPath(next))}`;
    await notifyMagicLink({ email: user.email, name: user.name || "there", link, minutes: MAGIC_LINK_MINUTES });
    await audit({ userId: user.id, action: "REQUEST_MAGIC_LINK", resource: `User:${user.id}` });
  } else {
    await audit({ userId: null, action: "REQUEST_MAGIC_LINK_UNKNOWN_EMAIL", metadata: { email } });
  }
  return { ok: true };
}
