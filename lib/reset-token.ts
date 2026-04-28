// Password-reset token: signed with AUTH_SECRET, no DB row required.
//
// Format: base64url(payload).base64url(hmac-sha256(payload))
// Payload: { uid: <userId>, exp: <unix-seconds>, v: 1 }
//
// Why not store in the DB? Because we'd need a Prisma migration to add a
// new model, which our deploy can't run automatically. HMAC tokens are
// short-lived (30 min), single-purpose (password reset), and bound to the
// AUTH_SECRET, so the security tradeoff is reasonable for this use.
//
// Replay note: tokens remain valid until they expire — there's no
// server-side revocation. We mitigate by (a) short expiry, (b) including
// a "v" version field we can bump to invalidate everything, and (c)
// logging every reset to AuditLog.

import crypto from "crypto";

const TOKEN_VERSION = 1;
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

export function signResetToken(userId: string): string {
  const payload: Payload = {
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + EXPIRY_SECONDS,
    v: TOKEN_VERSION,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getSecret())
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${sig}`;
}

export function verifyResetToken(
  token: string,
): { userId: string } | { error: string } {
  if (typeof token !== "string" || !token.includes(".")) {
    return { error: "Malformed token." };
  }
  const [payloadB64, sig] = token.split(".", 2);
  if (!payloadB64 || !sig) return { error: "Malformed token." };

  const expectedSig = crypto
    .createHmac("sha256", getSecret())
    .update(payloadB64)
    .digest("base64url");

  // Constant-time comparison to avoid leaking sig info via timing.
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { error: "Invalid token." };
  }

  let payload: Payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  } catch {
    return { error: "Malformed token." };
  }
  if (payload.v !== TOKEN_VERSION) return { error: "Token version mismatch." };
  if (typeof payload.uid !== "string" || !payload.uid)
    return { error: "Token missing user." };
  if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) {
    return { error: "This reset link has expired. Please request a new one." };
  }
  return { userId: payload.uid };
}
