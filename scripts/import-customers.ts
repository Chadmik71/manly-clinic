/**
 * Customer import script
 * Run with:
 *   set DATABASE_URL=postgresql://neondb_owner:npg_Zrs5BFnJ4Wpc@ep-misty-math-a79qizet-pooler.ap-southeast-2.aws.neon.tech/neondb?sslmode=require
 *   npx tsx scripts/import-customers.ts
 */

import { PrismaClient } from "@prisma/client";
import { parse } from "csv-parse/sync";
import * as fs from "fs";
import * as path from "path";

const db = new PrismaClient();

function normalisePhone(raw: string): string {
    if (!raw) return raw;
    const cleaned = raw.replace(/[\s\-]/g, "");
    if (/^\+614\d{8}$/.test(cleaned)) return "0" + cleaned.slice(3);
    if (/^614\d{8}$/.test(cleaned)) return "0" + cleaned.slice(2);
    return cleaned;
}

function buildName(first: string, last: string): string {
    const f = (first || "").trim();
    const l = (last || "").trim();
    if (f && l) return `${f} ${l}`;
    return f || l || "Unknown";
}

function normaliseGender(g: string): string | null {
    if (!g) return null;
    const lower = g.toLowerCase();
    if (lower === "male" || lower === "m") return "MALE";
    if (lower === "female" || lower === "f") return "FEMALE";
    return "OTHER";
}

async function main() {
    const csvPath = path.join(process.cwd(), "prisma", "customers_export_2026_04_24_1047.csv");

  if (!fs.existsSync(csvPath)) {
        console.error(`CSV not found at ${csvPath}`);
        process.exit(1);
  }

  const raw = fs.readFileSync(csvPath, "utf-8");
    const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true }) as Record<string, string>[];

  console.log(`Found ${rows.length} customers to import...`);

  let created = 0, updated = 0, skipped = 0, errors = 0;

  for (const row of rows) {
        try {
                const externalId = row["ID"]?.trim();
                if (!externalId) { skipped++; continue; }

          const name = buildName(row["First Name"], row["Last Name"]);
                const email = row["Email"]?.trim() || null;
                const rawPhone = row["Phone"]?.trim() || null;
                const phone = rawPhone ? normalisePhone(rawPhone) : null;
                const birthday = row["Birthday"]?.trim() || null;
                const dob = birthday ? new Date(birthday) : null;
                const gender = normaliseGender(row["Gender"] || "");
                const notes = row["Notes"]?.trim() || null;
                const noShowCount = parseInt(row["Number of Declined Bookings"] || "0", 10);
                const visitCount = parseInt(row["Total Bookings"] || "0", 10);

          const resolvedEmail = email && email.includes("@")
                  ? email.toLowerCase()
                    : `imported-${externalId}@manlyremedialthai.com.au`;

          const existing = await db.user.findUnique({ where: { externalId } });

          if (existing) {
                    await db.user.update({
                                where: { externalId },
                                data: { name, phone, visitCount, noShowCount, notes, dob: dob && !isNaN(dob.getTime()) ? dob : null, gender },
                    });
                    updated++;
          } else {
                    const emailExists = await db.user.findUnique({ where: { email: resolvedEmail } });
                    if (emailExists) {
                                await db.user.update({
                                              where: { email: resolvedEmail },
                                              data: { externalId, visitCount, noShowCount, notes, dob: dob && !isNaN(dob.getTime()) ? dob : null, gender, phone: phone ?? undefined },
                                });
                                updated++;
                    } else {
                                await db.user.create({
                                              data: {
                                                              email: resolvedEmail, name, phone, role: "CLIENT", externalId,
                                                              visitCount, noShowCount, notes,
                                                              dob: dob && !isNaN(dob.getTime()) ? dob : null,
                                                              gender,
                                                              passwordHash: "$2b$10$IMPORTED_PLACEHOLDER_CANNOT_LOGIN_DIRECTLY_XXXXXXXXXXX",
                                              },
                                });
                                created++;
                    }
          }

          if ((created + updated) % 100 === 0 && (created + updated) > 0)
                    console.log(`  Progress: ${created} created, ${updated} updated, ${errors} errors`);

        } catch (err: unknown) {
                errors++;
                console.error(`  Error on row ID ${row["ID"]}: ${err instanceof Error ? err.message : String(err)}`);
        }
  }

  console.log("\n✅ Import complete!");
    console.log(`   Created : ${created}`);
    console.log(`   Updated : ${updated}`);
    console.log(`   Skipped : ${skipped}`);
    console.log(`   Errors  : ${errors}`);
    console.log(`   Total   : ${rows.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
