/**
 * Seed one upcoming CONFIRMED booking for the smoke-client account so the
 * smoke test's invoice / reschedule / deposit chain (currently SKIP'd
 * "Discover client booking · no upcoming reschedule link") can run.
 *
 * Idempotent. Default: do nothing if the smoke-client already has any
 * future PENDING / CONFIRMED booking. Pass --recreate to delete the
 * existing seeded booking (matched by a sentinel notes value) and create
 * a fresh one.
 *
 * Companion to scripts/seed-test-voucher.ts and scripts/seed-sample-history.ts.
 *
 * Usage:
 *   npx tsx scripts/seed-smoke-booking.ts             # create-if-missing
 *   npx tsx scripts/seed-smoke-booking.ts --recreate  # replace existing
 *   npx tsx scripts/seed-smoke-booking.ts --clean     # remove sentinel booking
 *
 * DATABASE_URL is loaded from .env.local (preferred) or .env. To target
 * production, ensure .env.local has the prod URL or pre-export it.
 */
try {
  // Node 20.6+ — types are bundled in current @types/node.
  process.loadEnvFile(".env.local");
} catch {
  try {
    process.loadEnvFile(".env");
  } catch {
    /* rely on env */
  }
}

import { PrismaClient } from "@prisma/client";
import { addDays, setHours, setMinutes, setSeconds, setMilliseconds, addMinutes } from "date-fns";
import { bookingReference } from "../lib/utils";

const db = new PrismaClient();

const SMOKE_CLIENT_EMAIL = "smoke-client@manlyremedialthai.com.au";
// Sentinel in Booking.notes so --clean and --recreate can find the row
// without colliding with any organic notes content.
const SENTINEL_NOTE = "[smoke-seed]";

function nextSydney10amUtc(daysAhead: number): Date {
  // Build a "tomorrow 10:00 Sydney" instant. AEST is UTC+10, AEDT UTC+11.
  // Simplest reliable approach: compute a Date in server TZ, then offset
  // to Sydney by 10–11 hours depending on DST. We sidestep DST guessing
  // by using Intl with timeZone=Australia/Sydney to back into UTC.
  const target = addDays(new Date(), daysAhead);
  // Stamp a date-only baseline then re-parse via Sydney TZ.
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(target);
  // ymd is "YYYY-MM-DD" in Sydney calendar terms. Compose ISO at 10:00 Sydney
  // by checking offset via Intl.
  const sydneyDate = new Date(`${ymd}T10:00:00+10:00`);
  // If AEDT is active, the above sets us at 09:00 Sydney clock time; correct
  // by adding 1h when the resolved Sydney hour for that instant is 09.
  const sydneyHour = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    hour12: false,
  }).format(sydneyDate);
  if (sydneyHour === "09") return new Date(sydneyDate.getTime() - 60 * 60 * 1000);
  if (sydneyHour === "11") return new Date(sydneyDate.getTime() + 60 * 60 * 1000);
  return sydneyDate;
}

async function findClient() {
  const client = await db.user.findUnique({
    where: { email: SMOKE_CLIENT_EMAIL },
    select: { id: true, name: true, email: true },
  });
  if (!client) {
    throw new Error(
      `No User found with email ${SMOKE_CLIENT_EMAIL}. Run the smoke-client provisioning script first.`,
    );
  }
  return client;
}

async function clean(clientId: string): Promise<number> {
  const result = await db.booking.deleteMany({
    where: {
      clientId,
      notes: { contains: SENTINEL_NOTE },
    },
  });
  return result.count;
}

async function existingUpcoming(clientId: string) {
  return db.booking.findFirst({
    where: {
      clientId,
      status: { in: ["PENDING", "CONFIRMED"] },
      startsAt: { gte: new Date() },
    },
    orderBy: { startsAt: "asc" },
    select: { id: true, reference: true, startsAt: true, status: true, notes: true },
  });
}

async function createSeed(clientId: string) {
  // Pick the cheapest active service + its shortest variant. We avoid the
  // health-fund service deliberately — claim flow requires extra fields we
  // don't want to seed here, and the smoke doesn't need them.
  const variant = await db.serviceVariant.findFirst({
    where: { service: { active: true, healthFundEligible: false } },
    orderBy: { durationMin: "asc" },
    include: { service: { select: { name: true } } },
  });
  if (!variant) throw new Error("No active non-health-fund service variant found to seed against.");

  // Pick any active therapist. Skipping the full availability/conflict
  // dance — smoke just needs a syntactically valid booking row to render.
  const therapist = await db.therapist.findFirst({
    where: { active: true },
    select: { id: true },
  });
  if (!therapist) throw new Error("No active therapist found to seed against.");

  const startsAt = nextSydney10amUtc(2); // two days out — well outside any 1h-cancel-window noise
  const endsAt = addMinutes(startsAt, variant.durationMin);

  const booking = await db.booking.create({
    data: {
      reference: bookingReference(),
      clientId,
      serviceId: variant.serviceId,
      variantId: variant.id,
      therapistId: therapist.id,
      startsAt,
      endsAt,
      status: "CONFIRMED",
      priceCentsAtBooking: variant.priceCents,
      notes: `${SENTINEL_NOTE} seeded for smoke test`,
    },
    select: {
      id: true,
      reference: true,
      startsAt: true,
      service: { select: { name: true } },
    },
  });

  return booking;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  const host = dbUrl ? dbUrl.replace(/^[^@]+@/, "").split("/")[0] : "(unknown)";
  console.log(`DB host: ${host}\n`);

  const client = await findClient();
  console.log(`Smoke client: ${client.email} (id ${client.id})`);

  if (process.argv.includes("--clean")) {
    const removed = await clean(client.id);
    console.log(`Removed ${removed} sentinel booking(s).`);
    return;
  }

  if (process.argv.includes("--recreate")) {
    const removed = await clean(client.id);
    if (removed > 0) console.log(`Removed ${removed} previous sentinel booking(s).`);
  } else {
    const upcoming = await existingUpcoming(client.id);
    if (upcoming) {
      console.log(
        `Existing upcoming booking found (ref ${upcoming.reference}, ${upcoming.status}, ${upcoming.startsAt.toISOString()}). No change.`,
      );
      console.log("Re-run with --recreate to replace, or --clean to remove.");
      return;
    }
  }

  const seeded = await createSeed(client.id);
  console.log(
    `Seeded booking ref ${seeded.reference} — ${seeded.service.name} @ ${seeded.startsAt.toISOString()}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
