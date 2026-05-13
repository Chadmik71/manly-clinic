/**
 * Sample data: a returning remedial-massage + health-fund customer with
 * 8 weekly visits over 2 months. Useful for previewing what the staff
 * intake-history page and the returning-customer pre-fill flow look like
 * with a realistic dataset.
 *
 * Usage (run against whatever DATABASE_URL is in .env):
 *   npx tsx scripts/seed-sample-history.ts          # seed (idempotent)
 *   npx tsx scripts/seed-sample-history.ts --clean  # remove everything created
 *
 * The script identifies the synthetic client by a sentinel email so it
 * can be re-run safely and cleaned up later. Synthetic data only — names,
 * phone numbers and fund member numbers are obviously fake per the repo's
 * "no real patient data in scripts" rule.
 */

import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const db = new PrismaClient();

const TEST_EMAIL = "sample.history@example.test";
const TEST_NAME = "Sample Patient (test data — safe to delete)";
const TEST_PHONE = "+61400000099";
const TEST_PASSWORD = "sample123"; // so you can log in as the client too
const HEALTH_FUND = "Medibank";
const FUND_MEMBER = "TEST-1234567A";

// SVG signature paths — visually distinguishable but obviously fake.
// SVG data URLs render correctly in <img> tags on the intake history page.
function svgSig(seed: number): string {
  const wiggle = (offset: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const x = 20 + i * 35 + ((seed * 3 + i) % 5);
      const y = 30 + Math.sin(seed + i) * 12 + offset;
      return `${i === 0 ? "M" : "T"} ${x} ${Math.round(y)}`;
    }).join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 60" width="240" height="60"><rect width="240" height="60" fill="white"/><path d="${wiggle(0)}" stroke="#111" stroke-width="2" fill="none" stroke-linecap="round"/><path d="${wiggle(-4)}" stroke="#111" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.7"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

// Sydney 10am on the Monday N weeks ago. Returns a UTC Date.
function sydneyMondayWeeksAgo(weeksAgo: number): Date {
  const sydneyOffsetMs = 10 * 3600 * 1000; // AEST = UTC+10 (no DST adjustment — approximate)
  const now = new Date();
  // Get current Sydney day-of-week
  const nowSydney = new Date(now.getTime() + sydneyOffsetMs);
  const dow = nowSydney.getUTCDay(); // 0=Sun, 1=Mon, ...
  const daysToLastMonday = dow === 0 ? 6 : dow - 1;
  const lastMondayUtcMidnight = new Date(
    Date.UTC(
      nowSydney.getUTCFullYear(),
      nowSydney.getUTCMonth(),
      nowSydney.getUTCDate() - daysToLastMonday - weeksAgo * 7,
      0, // 0am Sydney = -10am UTC, so subtract 10 hours
    ),
  );
  // Move to 10am Sydney = 00:00 UTC of that day
  return new Date(lastMondayUtcMidnight.getTime() + (10 - 10) * 3600 * 1000);
}

// Per-visit clinical progression (oldest first). Pain trends down, focus shifts.
const VISIT_TEMPLATES = [
  {
    painScale: 8,
    painLocation: "Lower back, right side. Sharp on bending forward.",
    painOnset: "3 weeks ago after lifting a heavy box at home",
    painHistory: "Worse in mornings and after sitting >30min. Heat helps.",
    treatmentGoals: "Reduce acute pain so I can return to gym training.",
    zones: ["b-lower-back", "b-glute-r", "b-hamstring-r"],
    history: ["disc_injury", "anxiety_depression"],
    reason: "Acute lower back pain, suspected lumbar muscle strain.",
    notes: "First visit. Tight QL and glute med on right.",
  },
  {
    painScale: 7,
    painLocation: "Lower back right, easing slightly. Right glute still tight.",
    painOnset: "4 weeks ago, gradually improving",
    painHistory: "Less morning stiffness this week.",
    treatmentGoals: "Continue pain reduction; return to light cardio.",
    zones: ["b-lower-back", "b-glute-r"],
    history: ["disc_injury", "anxiety_depression"],
    reason: "Follow-up remedial. Lumbar strain rehab.",
    notes: "Glute work + lumbar paraspinals.",
  },
  {
    painScale: 5,
    painLocation: "Lower back, lower intensity. Some referred pain into right thigh.",
    painOnset: "5 weeks ago",
    painHistory: "Steady improvement. Can drive comfortably now.",
    treatmentGoals: "Address remaining tension before resuming strength training.",
    zones: ["b-lower-back", "b-glute-r", "f-quad-r"],
    history: ["disc_injury", "anxiety_depression"],
    reason: "Ongoing remedial for lumbar strain recovery.",
    notes: "Released right TFL & vastus lateralis.",
  },
  {
    painScale: 4,
    painLocation: "Mild lower back, plus upper trap tension from desk work.",
    painOnset: "Lower back: 6wk ago. Trap: ongoing.",
    painHistory: "Back pain mostly resolved. New trap pain from work-from-home setup.",
    treatmentGoals: "Maintain lumbar progress; address upper trap.",
    zones: ["b-lower-back", "b-trap-l", "b-trap-r", "b-upper-back"],
    history: ["disc_injury", "anxiety_depression"],
    reason: "Remedial — multi-area maintenance + new upper-back complaint.",
    notes: "Switched focus 50/50 to upper traps + lumbar.",
  },
  {
    painScale: 3,
    painLocation: "Upper traps and right side of neck. Lower back stable.",
    painOnset: "Upper trap pain 3 weeks; lower back resolved",
    painHistory: "Pain worst by end of work day. Cervical rotation tight on right.",
    treatmentGoals: "Reduce neck/shoulder tension; ergonomic homework.",
    zones: ["b-trap-l", "b-trap-r", "b-neck", "b-upper-back"],
    history: ["disc_injury", "anxiety_depression", "migraines"],
    reason: "Cervical and upper-thoracic remedial work.",
    notes: "SCM and scalene release. Added migraines to history this visit.",
  },
  {
    painScale: 3,
    painLocation: "Right neck/shoulder, occasional headache.",
    painOnset: "Ongoing, 4 weeks",
    painHistory: "Headaches less frequent since last week.",
    treatmentGoals: "Continue cervical work; address levator scap.",
    zones: ["b-trap-r", "b-neck", "b-shoulder-r"],
    history: ["disc_injury", "anxiety_depression", "migraines"],
    reason: "Remedial — cervical/upper-thoracic.",
    notes: "Levator scap and suboccipitals key today.",
  },
  {
    painScale: 2,
    painLocation: "Minor right trap tightness, no acute pain.",
    painOnset: "Maintenance phase",
    painHistory: "No headaches in 10 days. Sleep improving.",
    treatmentGoals: "Maintenance + general recovery.",
    zones: ["b-trap-r", "b-upper-back"],
    history: ["disc_injury", "anxiety_depression", "migraines"],
    reason: "Maintenance remedial — focusing on upper back and neck.",
    notes: "Mostly maintenance massage; client feels well.",
  },
  {
    painScale: 2,
    painLocation: "General mild tension, well-managed.",
    painOnset: "—",
    painHistory: "Returned to gym 3x/week, no flare-ups.",
    treatmentGoals: "Ongoing fortnightly maintenance.",
    zones: ["b-upper-back", "b-trap-r"],
    history: ["disc_injury", "anxiety_depression", "migraines"],
    reason: "Maintenance remedial.",
    notes: "Discussed moving to fortnightly schedule. Client agreed.",
  },
];

async function findRemedialVariant() {
  const service = await db.service.findUnique({
    where: { slug: "remedial-massage" },
    include: {
      variants: {
        orderBy: { durationMin: "asc" },
      },
    },
  });
  if (!service) {
    throw new Error("Service 'remedial-massage' not found. Did seed.ts run?");
  }
  // Prefer 60-min variant; fall back to first
  const variant =
    service.variants.find((v) => v.durationMin === 60) ?? service.variants[0];
  if (!variant) throw new Error("No variants for remedial-massage.");
  return { service, variant };
}

async function findTherapist() {
  const t = await db.therapist.findFirst({
    where: { active: true },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { id: "asc" },
  });
  if (!t) throw new Error("No active therapist found — seed therapists first.");
  return t;
}

async function upsertTestClient() {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  return db.user.upsert({
    where: { email: TEST_EMAIL },
    update: {
      name: TEST_NAME,
      phone: TEST_PHONE,
      role: "CLIENT",
      passwordHash,
    },
    create: {
      email: TEST_EMAIL,
      name: TEST_NAME,
      phone: TEST_PHONE,
      role: "CLIENT",
      passwordHash,
    },
  });
}

async function seed() {
  console.log("→ Looking up remedial-massage 60-min variant...");
  const { service, variant } = await findRemedialVariant();
  console.log(`  service=${service.slug}  variant=${variant.id}  (${variant.durationMin}min, $${variant.priceCents / 100})`);

  console.log("→ Looking up an active therapist...");
  const therapist = await findTherapist();
  console.log(`  therapist=${therapist.id}  ${therapist.displayName ?? therapist.user.name}`);

  console.log("→ Upserting synthetic test client...");
  const client = await upsertTestClient();
  console.log(`  client.id=${client.id}  email=${client.email}`);

  // Wipe any prior runs so this script is idempotent.
  console.log("→ Removing any prior sample history for this client...");
  const oldBookings = await db.booking.deleteMany({ where: { clientId: client.id } });
  const oldIntakes = await db.intakeForm.deleteMany({ where: { userId: client.id } });
  const oldConsents = await db.consentRecord.deleteMany({ where: { userId: client.id } });
  console.log(`  removed: bookings=${oldBookings.count}  intakes=${oldIntakes.count}  consents=${oldConsents.count}`);

  console.log("→ Creating 8 weekly visits (oldest first)...");
  for (let i = 0; i < VISIT_TEMPLATES.length; i++) {
    const weeksAgo = VISIT_TEMPLATES.length - i; // visit 1 = 8 weeks ago, visit 8 = 1 week ago
    const tpl = VISIT_TEMPLATES[i];
    const startsAt = sydneyMondayWeeksAgo(weeksAgo);
    const endsAt = new Date(startsAt.getTime() + variant.durationMin * 60 * 1000);
    const ref = `SAMPLE-${String(i + 1).padStart(2, "0")}-${client.id.slice(-6).toUpperCase()}`;

    // Booking — historical COMPLETED with health-fund claim.
    // Note: the schema enforces (via app-level guard) that health-fund
    // bookings can't be completed without assignedTherapist* set, so we
    // populate the audit trail here as if a staff member self-assigned
    // Mick at the end of the appointment.
    const assignedName = therapist.displayName ?? therapist.user.name ?? "Therapist";
    await db.booking.create({
      data: {
        reference: ref,
        clientId: client.id,
        serviceId: service.id,
        variantId: variant.id,
        therapistId: therapist.id,
        startsAt,
        endsAt,
        status: "COMPLETED",
        priceCentsAtBooking: variant.priceCents,
        claimWithHealthFund: true,
        paidCents: variant.priceCents,
        notes: tpl.notes,
        paymentIntentId: null,
        // Audit fields for "who actually performed the service" (HICAPS
        // requirement). For the sample we record the therapist as self-
        // assigned at the booking start time.
        assignedTherapistId: therapist.userId,
        assignedTherapistName: assignedName,
        assignedAt: startsAt,
        assignedById: therapist.userId,
      },
    });

    // IntakeForm — clinical detail + signature.
    await db.intakeForm.create({
      data: {
        userId: client.id,
        medicalConditions: "Otherwise generally healthy. See history below.",
        medications: i < 2 ? "Ibuprofen 200mg as needed" : "None currently",
        allergies: "None known",
        injuries: i < 4
          ? "Lower back strain (acute)"
          : "Lower back strain (recovering)",
        medicalHistory: JSON.stringify(tpl.history),
        painLocationCodes: JSON.stringify(tpl.zones),
        painLocation: tpl.painLocation,
        painScale: tpl.painScale,
        painOnset: tpl.painOnset,
        painHistory: tpl.painHistory,
        treatmentGoals: tpl.treatmentGoals,
        pregnancy: false,
        pregnancyWeeks: null,
        emergencyContactName: "Pat Doe",
        emergencyContactRelationship: "Spouse",
        emergencyContactPhone: "+61400000098",
        healthFundName: HEALTH_FUND,
        healthFundMemberNumber: FUND_MEMBER,
        reasonForTreatment: tpl.reason,
        consentToTreat: true,
        consentToStore: true,
        signedAt: startsAt,
        signatureDataUrl: svgSig(i + 1),
      },
    });

    // ConsentRecord (mirrors what createBooking writes).
    await db.consentRecord.createMany({
      data: [
        {
          userId: client.id,
          type: "TREATMENT",
          version: "1.0",
          granted: true,
          ipAddress: null,
          userAgent: "seed-sample-history.ts",
        },
        {
          userId: client.id,
          type: "HEALTH_INFO_STORAGE",
          version: "1.0",
          granted: true,
          ipAddress: null,
          userAgent: "seed-sample-history.ts",
        },
      ],
    });

    console.log(
      `  visit ${i + 1}/${VISIT_TEMPLATES.length}  ${startsAt.toISOString().slice(0, 10)}  pain=${tpl.painScale}/10  zones=${tpl.zones.length}`,
    );
  }

  console.log("");
  console.log("✓ Done. Inspect via:");
  console.log(`  /staff/clients  → search for "Sample Patient"`);
  console.log(`  /staff/clients/${client.id}/intake-history`);
  console.log("");
  console.log("To preview the returning-customer pre-fill on the booking form,");
  console.log("sign in as the test client:");
  console.log(`  email: ${TEST_EMAIL}`);
  console.log(`  pass:  ${TEST_PASSWORD}`);
  console.log("then visit /book → remedial-massage → pick a future slot.");
  console.log("");
  console.log("Clean up afterwards with:");
  console.log("  npx tsx scripts/seed-sample-history.ts --clean");
}

async function clean() {
  console.log(`→ Looking up test client (${TEST_EMAIL})...`);
  const client = await db.user.findUnique({ where: { email: TEST_EMAIL } });
  if (!client) {
    console.log("  not found — nothing to clean.");
    return;
  }
  console.log(`  found client.id=${client.id}`);

  console.log("→ Deleting bookings...");
  const b = await db.booking.deleteMany({ where: { clientId: client.id } });
  console.log(`  removed ${b.count} bookings`);

  console.log("→ Deleting user (cascades to IntakeForm + ConsentRecord)...");
  await db.user.delete({ where: { id: client.id } });
  console.log("  user removed.");

  console.log("");
  console.log("✓ Done. Any AuditLog rows referencing this user now have userId=null (kept for compliance).");
}

async function main() {
  const arg = process.argv[2];
  if (arg === "--clean") {
    await clean();
  } else if (arg && arg !== "--seed") {
    console.error(`Unknown arg "${arg}". Use --clean to remove the sample, or no args to seed.`);
    process.exit(1);
  } else {
    await seed();
  }
}

main()
  .catch((err) => {
    console.error("FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
