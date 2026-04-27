// Verifies the 8pm cap. For each (service, duration), fetches the booking
// page and asserts the latest slot time satisfies start + duration ≤ 8:00 pm.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const BASE = process.argv[2] || "http://localhost:3000";

const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const dateStr = tomorrow.toISOString().slice(0, 10);
const CAP = 20 * 60; // 8:00 pm

const services = await db.service.findMany({
  include: { variants: { orderBy: { durationMin: "asc" } } },
});

let pass = 0, fail = 0;
function toMin(t) {
  const [hm, ampm] = t.split(" ");
  let [h, m] = hm.split(":").map(Number);
  if (ampm.toLowerCase() === "pm" && h !== 12) h += 12;
  if (ampm.toLowerCase() === "am" && h === 12) h = 0;
  return h * 60 + m;
}
for (const s of services) {
  for (const v of s.variants) {
    const url = `${BASE}/book?service=${s.slug}&variant=${v.id}&date=${dateStr}`;
    const html = await fetch(url).then(r => r.text());
    // Slot links: <a href="/book/confirm?..." ...>9:00 AM</a>
    const slotTimes = [...html.matchAll(/>(\d{1,2}:(?:00|15|30|45) (?:AM|PM|am|pm))<\/a>/g)].map(m => m[1]);
    if (slotTimes.length === 0) {
      // duration may not fit; skip
      continue;
    }
    const latestStart = Math.max(...slotTimes.map(toMin));
    const latestEnd = latestStart + v.durationMin;
    const ok = latestEnd <= CAP;
    const expectedLatest = CAP - v.durationMin;
    const tag = ok ? "PASS" : "FAIL";
    if (ok) pass++; else fail++;
    console.log(`${tag} ${s.slug} ${v.durationMin}min: latest start=${minTo12h(latestStart)} end=${minTo12h(latestEnd)} (cap allows up to ${minTo12h(expectedLatest)})`);
  }
}
function minTo12h(m) {
  const h = Math.floor(m / 60), mm = m % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, "0")} ${ampm}`;
}
await db.$disconnect();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
