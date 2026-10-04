// Installs the append-only triggers on "AuditLog" (prisma/sql/audit-log-append-only.sql)
// against DATABASE_URL. Safe to re-run. After a fresh database or a Neon branch
// reset, run it again: Prisma doesn't create triggers.
//
//   npx tsx scripts/protect-audit-log.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  const sql = readFileSync(join(__dirname, "..", "prisma", "sql", "audit-log-append-only.sql"), "utf8");
  // Prisma runs one statement per call. Split only where a statement ends and
  // the next CREATE/DROP begins, so the semicolons inside $$ bodies stay put.
  const statements = sql.split(/;\s*\n(?=\s*(?:CREATE|DROP)\b)/).map((s) => s.trim().replace(/;$/, "")).filter(Boolean);
  for (const s of statements) await db.$executeRawUnsafe(s);
  const triggers = await db.$queryRaw<{ tgname: string }[]>`
    SELECT tgname FROM pg_trigger
    WHERE tgrelid = '"AuditLog"'::regclass AND NOT tgisinternal
    ORDER BY tgname`;
  console.log("AuditLog triggers:", triggers.map((t) => t.tgname).join(", "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
