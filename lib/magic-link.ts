// One-tap email sign-in links for clients (no password needed).
//
// Token: base64url(payload).base64url(hmac-sha256("magic." + payload)), signed
// with AUTH_SECRET. Payload { uid, exp, n } where n is a random nonce.
// - Expires after 20 minutes.
// - Single use: the nonce is recorded in AuditLog (MAGIC_LINK_LOGIN,
//   resource "MagicLink:<nonce>") on first use and refused after that.
// - Clients only: staff and admin accounts keep signing in with a password.
// - The link opens a page with a "Sign in" button rather than signing in on
//   page load, so email link scanners that pre-open links can't use it up.

import crypto from "crypto";
import { db } from "@/lib/db";

export const MAGIC_LINK_MINUTES = 20;

type Payload = { uid: string; exp: number; n: string };

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function sign(payloadB64: string): string {
  return crypto.createHmac("sha256", secret()).update(`magic.${payloadB64}`).digest("base64url");
}

export function signMagicLinkToken(userId: string): string {
  const payload: Payload = {
    uid: userId,
    exp: Math.floor(Date.now() / 1000) + MAGIC_LINK_MINUTES * 60,
    n: crypto.randomBytes(16).toString("base64url"),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64)}`;
}

/**
 * Checks a token and, if valid and unused, marks it used. Returns the client
 * user to sign in, or null. Callers must not reveal why a token failed.
 */
export async function consumeMagicLinkToken(
  token: string,
): Promise<{ id: string; email: string; name: string; role: string } | null> {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payloadB64, sig] = token.split(".", 2);
  if (!payloadB64 || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(payloadB64));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: Payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
  } catch {
    return null;
  }
  if (typeof payload.uid !== "string" || typeof payload.n !== "string") return null;
  if (typeof payload.exp !== "number" || payload.exp < Date.now() / 1000) return null;

  const resource = `MagicLink:${payload.n}`;
  const used = await db.auditLog.findFirst({ where: { resource }, select: { id: true } });
  if (used) return null;

  const user = await db.user.findUnique({
    where: { id: payload.uid },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!user || user.role !== "CLIENT") return null;

  await db.auditLog.create({
    data: { userId: user.id, action: "MAGIC_LINK_LOGIN", resource },
  });
  return user;
}

/** Only same-site paths are allowed as the destination after sign-in. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/portal";
  }
  return next;
}
