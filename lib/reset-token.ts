// Password-reset token: signed with AUTH_SECRET, no DB row required.
//
// Format: base64url(payload).base64url(hmac-sha256(payload + "." + passwordHash))
// Payload: { uid: <userId>, exp: <unix-seconds>, v: 2 }
//
// Why not store in the DB? Because we'd need a Prisma migration to add a
// new model, which our deploy can't run automatically. HMAC tokens are
// short-lived (30 min), single-purpose (password reset), and bound to the
// AUTH_SECRET, so the security tradeoff is reasonable for this use.
//
// Single use: the signature also covers the user's current password hash.
// Setting a new password changes the hash (bcrypt salts every hash, even
// for the same password), so a link stops working the moment it's used,
// and any other outstanding links for that account die with it.
// resetPassword() additionally only writes if the hash is still the one
// the token was checked against, so two tabs submitting the same link
// can't both succeed. Every reset is logged to AuditLog.

import crypto from "crypto";
import { db } from "@/lib/db";

const TOKEN_VERSION = 2;
const EXPIRY_SECONDS = 30 * 60; // 30 minutes

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

type Payload = {
  uid: string;
  exp: number;
  v: number;
};

function sign(payloadB64: string, passwordHash: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(`${payloadB64}.${passwordHash}`)
    .digest("base64url");
}

/**
 * `expirySeconds` defaults to 30 minutes for self-service resets. Staff
 * portal invites use a longer window, since the client may not open the
 * email the same day; the link is still single-use (see above).
 */
export function signResetToken(
  userId: string,
  passwordHash: string,
  expirySeconds: number = EXPIRY_SECONDS,
): string {
  const payload: Payload = {
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + expirySeconds,
    v: TOKEN_VERSION,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64, passwordHash)}`;
}

const USED_OR_INVALID = "This reset link is no longer valid. It may have already been used. Please request a new one.";

/**
 * Checks a reset token. On success returns the user id plus the password
 * hash it was checked against, which resetPassword() uses to make the
 * write conditional.
 */
export async function verifyResetToken(
  token: string,
): Promise<{ userId: string; passwordHash: string } | { error: string }> {
  if (typeof token !== "string" || !token.includes(".")) {
    return { error: "Malformed token." };
  }
  const [payloadB64, sig] = token.split(".", 2);
  if (!payloadB64 || !sig) return { error: "Malformed token." };

  // The payload is only trusted after the signature check below; reading
  // it first is needed to know whose password hash to sign against.
  let payload: Payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  } catch {
    return { error: "Malformed token." };
  }
  if (payload.v !== TOKEN_VERSION) return { error: USED_OR_INVALID };
  if (typeof payload.uid !== "string" || !payload.uid)
    return { error: "Token missing user." };

  const user = await db.user.findUnique({
    where: { id: payload.uid },
    select: { id: true, passwordHash: true },
  });
  if (!user) return { error: USED_OR_INVALID };

  // Constant-time comparison to avoid leaking sig info via timing.
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payloadB64, user.passwordHash));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { error: USED_OR_INVALID };
  }
  if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) {
    return { error: "This reset link has expired. Please request a new one." };
  }
  return { userId: user.id, passwordHash: user.passwordHash };
}
