import { createHash } from "node:crypto";

// One-way fingerprint (SHA-256) of the PRODUCTION Neon endpoint id. We store a
// hash rather than the host itself because this repo is public — the hash
// reveals nothing about the prod host, but still lets the seed scripts
// recognise (and refuse) the production database.
//
// Why this guard exists: the seed scripts plant known default-password accounts
// (admin@clinic.local / admin123, etc.) and demo data. Running any of them
// against production would create a trivially-compromised admin and pollute
// real patient data, so we hard-block the prod target.
//
// If the prod database is ever re-provisioned with a new endpoint, recompute
// this hash: sha256 of the `ep-...` token (with any `-pooler` suffix removed).
const PROD_DB_ENDPOINT_SHA256 =
  "08dd0f8bf8278e811e75e6e5a86c552cad21aca602e453ca09ce7b34aaf7c560";

/** Extract the stable Neon endpoint id (`ep-...`, minus any `-pooler` suffix). */
function endpointId(url: string): string | null {
  const m = url.match(/ep-[a-z0-9-]+/i);
  if (!m) return null;
  return m[0].replace(/-pooler$/i, "");
}

/**
 * Abort the process if DATABASE_URL points at the production database. Seed
 * scripts create insecure default accounts and demo data and must never touch
 * prod. Override (only with full awareness) via ALLOW_PROD_SEED=yes.
 */
export function assertNotProdDb(scriptName = "seed script"): void {
  const url = process.env.DATABASE_URL ?? "";
  const ep = endpointId(url);
  if (!ep) return; // not a Neon URL (e.g. local Postgres) — clearly not prod
  const fingerprint = createHash("sha256").update(ep).digest("hex");
  if (fingerprint !== PROD_DB_ENDPOINT_SHA256) return; // a dev branch — allowed

  if (process.env.ALLOW_PROD_SEED === "yes") {
    console.warn(
      `\n⚠️  ${scriptName}: PRODUCTION database detected, but ALLOW_PROD_SEED=yes is set — proceeding.\n`,
    );
    return;
  }
  throw new Error(
    `\n🛑 ${scriptName}: refusing to run against the PRODUCTION database.\n` +
      `   This script creates default-password accounts / demo data and must not touch prod.\n` +
      `   Point DATABASE_URL at a dev branch before seeding.\n` +
      `   (If you truly intend to seed prod, set ALLOW_PROD_SEED=yes — but you almost never should.)\n`,
  );
}
