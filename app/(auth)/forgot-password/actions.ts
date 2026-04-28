"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { signResetToken } from "@/lib/reset-token";
import { CLINIC } from "@/lib/clinic";

const schema = z.object({
  email: z.string().email().max(254),
});

export async function requestPasswordReset(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const raw: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string") raw[k] = v;
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Please enter a valid email address." };
  }

  const email = parsed.data.email.toLowerCase().trim();
  const user = await db.user.findUnique({ where: { email } });

  // Important: we always return ok=true to avoid leaking whether an
  // account exists for the given email (account-enumeration defence).
  if (!user) {
    // Still log the attempt so staff can see suspicious patterns.
    await audit({
      userId: null,
      action: "REQUEST_PASSWORD_RESET_UNKNOWN_EMAIL",
      metadata: { email },
    });
    return { ok: true };
  }

  // Issue a 30-minute HMAC token and email the link.
  const token = signResetToken(user.id);
  const link = `${CLINIC.domain}/reset-password?token=${encodeURIComponent(token)}`;

  const apiKey = process.env.RESEND_API_KEY;
  const subject = `Reset your ${CLINIC.name} password`;
  const html = `<p>Hi ${escapeHtml(user.name || "there")},</p>
<p>We received a request to reset the password for your ${CLINIC.name} account.</p>
<p><a href="${link}">Click here to set a new password</a> — this link expires in 30 minutes.</p>
<p>If you didn't request this, you can safely ignore this email; your password will not change.</p>
<p>— ${CLINIC.name}</p>`;

  if (apiKey) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from:
            process.env.EMAIL_FROM ??
            `bookings@${CLINIC.domain.replace(/^https?:\/\//, "")}`,
          to: email,
          subject,
          html,
        }),
      });
    } catch (e) {
      console.error("[password-reset email]", e);
    }
  } else {
    // Dev / no-key: log to server console so devs can copy the link.
    console.log("[password-reset:stub]", { to: email, link });
  }

  await audit({
    userId: user.id,
    action: "REQUEST_PASSWORD_RESET",
    resource: `User:${user.id}`,
    metadata: { email },
  });

  return { ok: true };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
