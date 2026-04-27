import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  const stillIntl = await db.user.findMany({
    where: { role: "CLIENT", phone: { startsWith: "+" } },
    select: { name: true, phone: true },
    take: 8,
  });
  const auFmtCount = await db.user.count({
    where: { role: "CLIENT", phone: { startsWith: "04" } },
  });
  const others = await db.user.findMany({
    where: {
      role: "CLIENT",
      phone: { not: null },
      NOT: [
        { phone: { startsWith: "04" } },
        { phone: { startsWith: "+" } },
      ],
    },
    select: { name: true, phone: true },
    take: 12,
  });
  console.log(`Still international (+ prefix): ${stillIntl.length}`);
  stillIntl.forEach((c) => console.log(`  ${c.phone}  ${c.name}`));
  console.log(`AU format (04…): ${auFmtCount}`);
  console.log(`Other formats kept as-is (sample):`);
  others.forEach((c) => console.log(`  ${c.phone}  ${c.name}`));
  await db.$disconnect();
}
main();
