"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { verifyResetToken } from "@/lib/reset-token";

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

export async function resetPassword(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string; email?: string }> {
  const raw: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string") raw[k] = v;
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { error: "Password must be at least 8 characters." };
  }

  const result = await verifyResetToken(parsed.data.token);
  if ("error" in result) return { error: result.error };

  const user = await db.user.findUnique({
    where: { id: result.userId },
    select: { id: true, email: true },
  });
  if (!user) return { error: "Account not found." };

  // Only write if the password hash is still the one the link was checked
  // against: if the same link was submitted twice at once, the second
  // write matches nothing. See lib/reset-token.ts.
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const { count } = await db.user.updateMany({
    where: { id: user.id, passwordHash: result.passwordHash },
    data: { passwordHash },
  });
  if (count === 0) {
    return { error: "This reset link has already been used. Please request a new one." };
  }

  await audit({
    userId: user.id,
    action: "RESET_PASSWORD",
    resource: `User:${user.id}`,
  });

  return { ok: true, email: user.email };
}
