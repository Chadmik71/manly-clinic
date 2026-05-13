/**
 * One-off: rename the "Remedial Massage" service so the customer-facing label
 * makes it obvious this is the only HiCAPS-rebatable treatment. Tightens the
 * description for the same reason.
 *
 * Idempotent — safe to re-run; it bails if the row already matches.
 *
 * Run against local dev:
 *   npx tsx scripts/rename-remedial-service.ts
 *
 * Run against production (grab DATABASE_URL from Vercel → Project → Settings
 * → Environment Variables → DATABASE_URL):
 *   DATABASE_URL="<prod url>" npx tsx scripts/rename-remedial-service.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const SLUG = "remedial-massage";
const NEW_NAME = "Remedial Massage (Health Fund Rebate)";
const NEW_DESCRIPTION =
  "The only treatment at our clinic eligible for HiCAPS health-fund rebates — bring your fund card for on-the-spot claiming. Targeted treatment for muscular pain, tension, postural issues and rehabilitation.";

async function main() {
  const current = await db.service.findUnique({ where: { slug: SLUG } });
  if (!current) {
    console.error(`No service with slug "${SLUG}" found in this DB. Nothing to do.`);
    process.exit(1);
  }
  if (current.name === NEW_NAME && current.description === NEW_DESCRIPTION) {
    console.log("Already renamed — no change.");
    return;
  }
  await db.service.update({
    where: { slug: SLUG },
    data: { name: NEW_NAME, description: NEW_DESCRIPTION },
  });
  console.log(`Renamed: "${current.name}" -> "${NEW_NAME}"`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
