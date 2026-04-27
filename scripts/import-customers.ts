// Import existing customer database from CSV.
// Idempotent — uses externalId to upsert.
//
// Usage:
//   npx tsx scripts/import-customers.ts "<path/to/customers.csv>"
//
// Phone rule: if phone matches /^4\d{8}$/ (9 digits starting with 4),
// prepend "0" to make Australian-standard 04xxxxxxxx. Otherwise leave as-is
// (some clients are international).
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

type Row = {
  ID: string;
  "First Name": string;
  "Last Name": string;
  Email: string;
  Phone: string;
  Company: string;
  Birthday: string;
  Gender: string;
  Notes: string;
  "Number of Declined Bookings": string;
  "Total Bookings": string;
};

function normalisePhone(raw: string): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s()-]/g, "").trim();
  if (!cleaned) return null;
  // +61 → strip the country code and prepend 0 (avoid double-zero on
  // malformed inputs like "+61 0412...").
  if (cleaned.startsWith("+61")) {
    const rest = cleaned.slice(3);
    return rest.startsWith("0") ? rest : "0" + rest;
  }
  // 9 digits starting with 4 → prepend 0
  if (/^4\d{8}$/.test(cleaned)) return "0" + cleaned;
  return cleaned;
}

function buildName(first: string, last: string): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  return [f, l].filter(Boolean).join(" ") || "(No name)";
}

function intOrZero(s: string): number {
  const n = parseInt((s ?? "").trim(), 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: npx tsx scripts/import-customers.ts <csv-path>");
    process.exit(1);
  }
  const abs = path.resolve(csvPath);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }

  const buf = fs.readFileSync(abs);
  const rows = parse(buf, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Row[];

  console.log(`Read ${rows.length} rows from ${path.basename(abs)}`);

  const placeholderHash = await bcrypt.hash(
    `imported-${Date.now()}-${Math.random()}`,
    10,
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let phoneFixed = 0;
  let noEmail = 0;

  for (const r of rows) {
    const externalId = (r.ID ?? "").trim();
    if (!externalId) {
      skipped++;
      continue;
    }
    const name = buildName(r["First Name"], r["Last Name"]);
    const rawPhone = (r.Phone ?? "").trim();
    const phone = normalisePhone(rawPhone);
    const phoneWasFixed =
      rawPhone && phone && phone !== rawPhone.replace(/\s+/g, "");
    if (phoneWasFixed) phoneFixed++;
    const visitCount = intOrZero(r["Total Bookings"]);
    const noShowCount = intOrZero(r["Number of Declined Bookings"]);
    const notes = (r.Notes ?? "").trim() || null;

    let email = (r.Email ?? "").trim().toLowerCase();
    if (!email) {
      // Synthetic placeholder so the row still imports. Client can later
      // sign up with their real email; staff can merge if needed.
      email = `imported-${externalId}@clinic.local`;
      noEmail++;
    }

    // Upsert by externalId (allows re-imports). If a User already exists with
    // this email but different externalId, we still upsert by externalId
    // (it's the source-of-truth identifier from the old system).
    const existing = await db.user.findUnique({ where: { externalId } });
    if (existing) {
      // Only update email if the new email is real AND no other user holds it.
      let newEmail: string | undefined;
      if (!email.endsWith("@clinic.local") && email !== existing.email) {
        const conflict = await db.user.findUnique({ where: { email } });
        if (!conflict) newEmail = email;
      }
      await db.user.update({
        where: { id: existing.id },
        data: {
          name,
          phone,
          visitCount,
          noShowCount,
          notes,
          ...(newEmail ? { email: newEmail } : {}),
        },
      });
      updated++;
    } else {
      // Avoid email collision with existing users (e.g. seeded admin)
      const conflict = await db.user.findUnique({ where: { email } });
      const finalEmail = conflict
        ? `imported-${externalId}@clinic.local`
        : email;
      try {
        await db.user.create({
          data: {
            externalId,
            email: finalEmail,
            passwordHash: placeholderHash,
            name,
            phone,
            role: "CLIENT",
            visitCount,
            noShowCount,
            notes,
          },
        });
        created++;
      } catch (e) {
        console.error(`Skipped row ${externalId}:`, (e as Error).message);
        skipped++;
      }
    }
  }

  console.log(
    `Done. Created: ${created}, updated: ${updated}, skipped: ${skipped}.`,
  );
  console.log(
    `Phone fixed (4xxxxxxxx → 04xxxxxxxx): ${phoneFixed}. No email on file (synthetic): ${noEmail}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
