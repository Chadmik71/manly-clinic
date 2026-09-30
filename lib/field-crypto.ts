/**
 * App-level encryption of sensitive health fields (second layer on top of
 * Neon's disk encryption). Anyone who gets a copy of the database, a backup
 * or the DB password sees `enc1:...` instead of medical history, clinical
 * notes, signatures or fund member numbers. The key lives only in the
 * FIELD_ENCRYPTION_KEY env var (Vercel), never in the database.
 *
 * Wired into the Prisma client in lib/db.ts, so the rest of the app reads
 * and writes plain values as before. Consequences worth knowing:
 *
 * - Encrypted columns can't be searched or filtered by value (`contains`,
 *   equality). `{ not: null }` still works: null and "" are stored as-is.
 * - Values are recognised by the `enc1:` prefix, so plaintext rows written
 *   before the backfill (scripts/encrypt-health-fields.ts) still read fine.
 * - Losing the key means losing the encrypted data. Keep a copy of it
 *   somewhere safe outside Vercel.
 *
 * Format: "enc1:" + base64(iv[12] | authTag[16] | ciphertext), AES-256-GCM.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "enc1:";

/**
 * Column names that get encrypted, on whichever model has them. Names are
 * matched regardless of model, so every name here must be one we want
 * encrypted everywhere it appears. `notes` (User/Booking) is deliberately
 * NOT here: the staff client search filters on it.
 */
export const ENCRYPTED_FIELDS: ReadonlySet<string> = new Set([
  // IntakeForm
  "medicalConditions",
  "medications",
  "allergies",
  "injuries",
  "medicalHistory",
  "painLocation",
  "painOnset",
  "painHistory",
  "treatmentGoals",
  "emergencyContactName",
  "emergencyContactRelationship",
  "emergencyContactPhone",
  "reasonForTreatment",
  "signatureDataUrl",
  "painLocationCodes",
  // IntakeForm + User
  "healthFundMemberNumber",
  // User
  "gpName",
  "gpClinic",
  "gpPhone",
  "preferences",
  // Booking (clinical SOAP notes + annotation drawing)
  "noteSubjective",
  "noteObjective",
  "noteAssessment",
  "notePlan",
  "noteAreasTreated",
  "noteTechniques",
  "noteOutcome",
  "noteAnnotationsPng",
]);

/** Parts of Prisma args that describe filtering/shape, not stored values. */
const NON_DATA_ARG_KEYS = new Set([
  "where",
  "select",
  "include",
  "omit",
  "orderBy",
  "cursor",
  "distinct",
  "by",
  "having",
  "_count",
]);

let cachedKey: Buffer | null | undefined;
let warnedNoKey = false;

function getKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const raw = process.env.FIELD_ENCRYPTION_KEY?.trim();
  if (!raw) {
    cachedKey = null;
    return null;
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY must be 32 bytes, base64-encoded (generate with: openssl rand -base64 32)",
    );
  }
  cachedKey = key;
  return key;
}

export function isEncrypted(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(PREFIX);
}

/**
 * Encrypts a value. Without a key configured, returns it unchanged (and
 * logs once) so a missing env var can't take bookings down. The backfill
 * script encrypts anything that slipped through once the key is back.
 */
export function encryptField(plain: string): string {
  if (plain === "" || isEncrypted(plain)) return plain;
  const key = getKey();
  if (!key) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.error("[field-crypto] FIELD_ENCRYPTION_KEY not set: health fields are being stored unencrypted");
    }
    return plain;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

/** Decrypts an `enc1:` value; anything else is returned unchanged. */
export function decryptField(value: string): string {
  if (!isEncrypted(value)) return value;
  const key = getKey();
  if (!key) {
    throw new Error("Encrypted health data found but FIELD_ENCRYPTION_KEY is not set");
  }
  const buf = Buffer.from(value.slice(PREFIX.length), "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function encryptValue(v: unknown): unknown {
  if (typeof v === "string") return encryptField(v);
  // Prisma's update form: { field: { set: "value" } }
  if (isPlainObject(v) && typeof v.set === "string") return { ...v, set: encryptField(v.set) };
  return v;
}

/**
 * Returns a copy of Prisma query args with every encrypted field's value
 * encrypted, including nested writes (create/update/upsert/createMany/…).
 * Copies rather than mutates: callers sometimes reuse the same data object
 * afterwards, e.g. to build a notification.
 */
export function encryptArgs<T>(args: T): T {
  if (Array.isArray(args)) return args.map((a) => encryptArgs(a)) as T;
  if (!isPlainObject(args)) return args;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    if (NON_DATA_ARG_KEYS.has(k)) out[k] = v;
    else if (ENCRYPTED_FIELDS.has(k)) out[k] = encryptValue(v);
    else out[k] = encryptArgs(v);
  }
  return out as T;
}

/** Decrypts every `enc1:` string anywhere in a query result, in place. */
export function decryptResult<T>(result: T): T {
  if (typeof result === "string") return decryptField(result) as T;
  if (Array.isArray(result)) {
    for (let i = 0; i < result.length; i++) result[i] = decryptResult(result[i]);
    return result;
  }
  if (isPlainObject(result)) {
    const obj: Record<string, unknown> = result;
    for (const k of Object.keys(obj)) obj[k] = decryptResult(obj[k]);
  }
  return result;
}
