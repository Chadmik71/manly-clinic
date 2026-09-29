/**
 * One-off backfill: encrypts health fields that were stored before
 * lib/field-crypto.ts existed (or while FIELD_ENCRYPTION_KEY was missing).
 * Safe to re-run: already-encrypted values are skipped.
 *
 *   npx tsx scripts/encrypt-health-fields.ts             # dry run: counts only
 *   npx tsx scripts/encrypt-health-fields.ts --apply     # encrypt
 *   npx tsx scripts/encrypt-health-fields.ts --decrypt --apply   # undo (rollback)
 *
 * Needs DATABASE_URL and FIELD_ENCRYPTION_KEY in the environment (.env is
 * loaded automatically). Uses a plain PrismaClient, not lib/db.ts, so it
 * sees the raw stored values. Prints counts only, never field contents.
 */
import { PrismaClient } from "@prisma/client";
import { ENCRYPTED_FIELDS, decryptField, encryptField, isEncrypted } from "../lib/field-crypto";

// Values already set in the shell win over .env (loadEnvFile never overrides).
try {
  process.loadEnvFile(".env");
} catch {
  // no .env: rely on the shell environment
}

const apply = process.argv.includes("--apply");
const decrypt = process.argv.includes("--decrypt");

if (!process.env.FIELD_ENCRYPTION_KEY) {
  console.error("FIELD_ENCRYPTION_KEY is not set. Aborting.");
  process.exit(1);
}

const db = new PrismaClient();

// Which encrypted columns live on which model.
const MODELS = {
  intakeForm: [
    "medicalConditions", "medications", "allergies", "injuries", "medicalHistory",
    "painLocation", "painOnset", "painHistory", "treatmentGoals",
    "emergencyContactName", "emergencyContactRelationship", "emergencyContactPhone",
    "reasonForTreatment", "signatureDataUrl", "painLocationCodes", "healthFundMemberNumber",
  ],
  user: ["healthFundMemberNumber", "gpName", "gpClinic", "gpPhone"],
  booking: [
    "noteSubjective", "noteObjective", "noteAssessment", "notePlan",
    "noteAreasTreated", "noteTechniques", "noteOutcome", "noteAnnotationsPng",
  ],
} as const;

type Delegate = {
  findMany(args: unknown): Promise<Record<string, unknown>[]>;
  update(args: unknown): Promise<unknown>;
};

const BATCH = 200;

async function run() {
  // Guard against the two lists drifting apart.
  const listed = new Set(Object.values(MODELS).flat());
  for (const f of ENCRYPTED_FIELDS) {
    if (!listed.has(f as never)) throw new Error(`Field ${f} is in ENCRYPTED_FIELDS but not mapped to a model here`);
  }

  console.log(`${apply ? "APPLYING" : "DRY RUN"}: ${decrypt ? "decrypt" : "encrypt"}`);
  let totalRows = 0;

  for (const [model, fields] of Object.entries(MODELS)) {
    const delegate = (db as unknown as Record<string, Delegate>)[model];
    const select = Object.fromEntries([["id", true], ...fields.map((f) => [f, true])]);
    let cursor: string | undefined;
    let rows = 0;
    let values = 0;

    for (;;) {
      const batch = await delegate.findMany({
        select,
        orderBy: { id: "asc" },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (batch.length === 0) break;
      cursor = batch[batch.length - 1].id as string;

      for (const row of batch) {
        const data: Record<string, string> = {};
        for (const f of fields) {
          const v = row[f];
          if (typeof v !== "string" || v === "") continue;
          if (decrypt ? isEncrypted(v) : !isEncrypted(v)) {
            data[f] = decrypt ? decryptField(v) : encryptField(v);
          }
        }
        const n = Object.keys(data).length;
        if (n === 0) continue;
        rows++;
        values += n;
        if (apply) await delegate.update({ where: { id: row.id }, data });
      }
    }
    console.log(`${model}: ${rows} rows / ${values} values ${apply ? "updated" : "to update"}`);
    totalRows += rows;
  }
  console.log(`Total rows ${apply ? "updated" : "to update"}: ${totalRows}`);
}

run()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
