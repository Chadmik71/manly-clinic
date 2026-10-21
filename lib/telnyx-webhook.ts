import crypto from "node:crypto";

// Telnyx signs every webhook (calls and texts) with Ed25519 over
// "<telnyx-timestamp>|<raw body>". TELNYX_PUBLIC_KEY is the base64 public key
// from the Telnyx portal (Keys & Credentials → Public Key).

const MAX_AGE_SEC = 300;
// DER header that wraps a raw 32-byte Ed25519 key as SPKI, which node:crypto reads.
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export type TelnyxRequest = { ok: true; body: string } | { ok: false; response: Response };

/** Reads the raw body and checks the signature and its age. With no public
 *  key set, every request is refused. */
export async function readTelnyxRequest(req: Request): Promise<TelnyxRequest> {
  const publicKey = process.env.TELNYX_PUBLIC_KEY;
  if (!publicKey) return { ok: false, response: new Response("Telnyx not configured", { status: 503 }) };

  const body = await req.text();
  const signature = req.headers.get("telnyx-signature-ed25519") ?? "";
  const timestamp = req.headers.get("telnyx-timestamp") ?? "";
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) <= MAX_AGE_SEC;
  if (signature && fresh && verify(`${timestamp}|${body}`, signature, publicKey)) return { ok: true, body };
  return { ok: false, response: new Response("Invalid signature", { status: 403 }) };
}

function verify(message: string, signatureB64: string, publicKeyB64: string): boolean {
  try {
    const key = crypto.createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, Buffer.from(publicKeyB64, "base64")]),
      format: "der",
      type: "spki",
    });
    return crypto.verify(null, Buffer.from(message), key, Buffer.from(signatureB64, "base64"));
  } catch {
    return false;
  }
}

/** Exposed for the test script that simulates Telnyx. */
export function signTelnyxRequest(body: string, timestamp: string, privateKey: crypto.KeyObject): string {
  return crypto.sign(null, Buffer.from(`${timestamp}|${body}`), privateKey).toString("base64");
}
