import crypto from "node:crypto";
import { CLINIC } from "@/lib/clinic";

// Every Twilio webhook carries X-Twilio-Signature: HMAC-SHA1 of the URL it
// called + the sorted POST params, keyed with TWILIO_AUTH_TOKEN.

function expectedSignature(url: string, params: URLSearchParams, token: string): string {
  const keys = [...new Set(params.keys())].sort();
  let data = url;
  for (const k of keys) for (const v of params.getAll(k)) data += k + v;
  return crypto.createHmac("sha1", token).update(data).digest("base64");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export type TwilioRequest =
  | { ok: true; params: URLSearchParams }
  | { ok: false; response: Response };

/** Reads the form body and checks the signature. Without TWILIO_AUTH_TOKEN
 *  set, every request is refused. */
export async function readTwilioRequest(req: Request): Promise<TwilioRequest> {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return { ok: false, response: new Response("Twilio not configured", { status: 503 }) };

  const params = new URLSearchParams(await req.text());
  const sig = req.headers.get("x-twilio-signature") ?? "";

  // Twilio signs the exact public URL it called. Behind Vercel req.url is
  // normally that URL; also accept the canonical domain in case of a proxy hop.
  const url = new URL(req.url);
  const candidates = [req.url, `${CLINIC.domain}${url.pathname}${url.search}`];
  if (!sig || !candidates.some((u) => safeEqual(sig, expectedSignature(u, params, token)))) {
    return { ok: false, response: new Response("Invalid signature", { status: 403 }) };
  }
  return { ok: true, params };
}

/** Exposed for the smoke/test scripts that simulate Twilio. */
export function signTwilioRequest(url: string, params: URLSearchParams, token: string): string {
  return expectedSignature(url, params, token);
}

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function twimlResponse(inner: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, {
    headers: { "content-type": "text/xml" },
  });
}
