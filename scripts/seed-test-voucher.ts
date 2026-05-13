/**
 * Seed a PENDING_PAYMENT voucher so you can verify the activation flow on
 * /staff/vouchers/[id] (the "Mark as paid & email code" button) without
 * going through the public /vouchers reservation form by hand.
 *
 * Usage (local dev):
 *   npx tsx scripts/seed-test-voucher.ts          # create
 *   npx tsx scripts/seed-test-voucher.ts --clean  # delete
 *
 * Usage (production — recipient email below WILL receive a real email if
 * you activate the voucher in the UI, so use an address you control):
 *   DATABASE_URL="<prod url>" npx tsx scripts/seed-test-voucher.ts
 *
 * Identifies the row by a sentinel code prefix so re-runs are safe and the
 * --clean mode finds it without ambiguity.
 */
import { PrismaClient } from "@prisma/client";
import { addMonths } from "date-fns";

const db = new PrismaClient();

const SENTINEL_PREFIX = "GV-TEST-";
const TEST_RECIPIENT_EMAIL = "chadmik711@gmail.com";
const TEST_RECIPIENT_NAME = "Test Recipient";
const TEST_AMOUNT_CENTS = 10000; // $100

function randomCode(): string {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${SENTINEL_PREFIX}${suffix}`;
}

async function clean() {
  const result = await db.voucher.deleteMany({
    where: { code: { startsWith: SENTINEL_PREFIX } },
  });
  console.log(`Removed ${result.count} test voucher(s).`);
}

async function create() {
  const existing = await db.voucher.findFirst({
    where: {
      code: { startsWith: SENTINEL_PREFIX },
      status: "PENDING_PAYMENT",
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    console.log(
      `Already have a PENDING_PAYMENT test voucher: ${existing.code} (id ${existing.id}). Re-run with --clean to remove.`,
    );
    return;
  }

  let code = randomCode();
  for (let i = 0; i < 5; i++) {
    const hit = await db.voucher.findUnique({ where: { code } });
    if (!hit) break;
    code = randomCode();
  }

  const voucher = await db.voucher.create({
    data: {
      code,
      amountCents: TEST_AMOUNT_CENTS,
      balanceCents: TEST_AMOUNT_CENTS,
      purchaserId: null,
      recipientName: TEST_RECIPIENT_NAME,
      recipientEmail: TEST_RECIPIENT_EMAIL,
      message: "Test voucher seeded by scripts/seed-test-voucher.ts",
      expiresAt: addMonths(new Date(), 12),
      status: "PENDING_PAYMENT",
    },
  });

  console.log("Created PENDING_PAYMENT test voucher:");
  console.log("  code:", voucher.code);
  console.log("  id  :", voucher.id);
  console.log("  url :", `/staff/vouchers/${voucher.id}`);
}

const mode = process.argv.includes("--clean") ? "clean" : "create";
(mode === "clean" ? clean() : create())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
