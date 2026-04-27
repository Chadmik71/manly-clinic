// Direct test of the slot library — verifies the 8pm cap.
import { PrismaClient } from "@prisma/client";
import { getDistinctSlotTimes } from "../lib/booking";
import { BOOKING_LATEST_END_MIN } from "../lib/clinic";

const db = new PrismaClient();

function minTo12h(m: number): string {
  const h = Math.floor(m / 60), mm = m % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}

async function main() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  const services = await db.service.findMany({
    where: { active: true },
    include: { variants: { orderBy: { durationMin: "asc" } } },
  });

  let pass = 0, fail = 0;
  for (const s of services) {
    for (const v of s.variants) {
      const slots = await getDistinctSlotTimes({
        date: tomorrow,
        durationMin: v.durationMin,
      });
      if (slots.length === 0) continue;
      const latest = slots[slots.length - 1];
      const startMin = latest.getHours() * 60 + latest.getMinutes();
      const endMin = startMin + v.durationMin;
      // Cap is met if the session ends at or before 8pm AND no later
      // 15-min-aligned start could still fit (i.e. cap is tight to the slot step).
      const STEP = 15;
      const fitsCap = endMin <= BOOKING_LATEST_END_MIN;
      const tight = startMin + STEP + v.durationMin > BOOKING_LATEST_END_MIN;
      const ok = fitsCap && tight;
      const tag = ok ? "PASS" : "FAIL";
      if (ok) pass++; else fail++;
      console.log(
        `${tag}  ${s.slug.padEnd(25)} ${String(v.durationMin).padStart(3)}min  latest start=${minTo12h(startMin)} → ends ${minTo12h(endMin)}`,
      );
    }
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  await db.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main();
