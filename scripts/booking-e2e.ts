// End-to-end test of the customer booking page (app/(public)/book/confirm).
// Drives a real Chrome through each booking path the way a customer would,
// then checks what landed in the database, then deletes its own test data.
//
//   npm run dev            (in one terminal)
//   npm run test:booking   (in another)
//
// DEV ONLY. Refuses to run unless the site is localhost and the database is
// not the production one. Test clients use e2e.*@example.com addresses and
// are deleted (with their bookings and forms) before and after each run.
//
// Run it before pushing any change to the booking page: it exists because a
// hidden required field once silently blocked "fill in later" bookings.

import fs from "node:fs";
import { chromium, type Page } from "playwright-core";
import { db } from "@/lib/db";
import { sydneyDateOf, sydneyLocalToUtc } from "@/lib/time";

try {
  process.loadEnvFile(".env.smoke");
} catch {
  // optional
}

const BASE = process.env.SMOKE_URL || "http://localhost:3000";
const CHROME =
  process.env.CHROME_PATH ||
  ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome"].find((p) => fs.existsSync(p));
const E2E_EMAIL = (who: string) => `e2e.${who}@example.com`;
const HEADED = process.argv.includes("--headed");

function refuseUnsafeTarget() {
  const host = new URL(BASE).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
    throw new Error(`Refusing to run against ${BASE}: this test creates bookings. Point SMOKE_URL at a local dev server.`);
  }
  let prodUrl = "";
  try {
    prodUrl = fs.readFileSync(".env.local", "utf8").match(/^DATABASE_URL_PROD="?([^"\r\n]+)/m)?.[1] ?? "";
  } catch {
    // no .env.local
  }
  const dbHost = (u: string) => u.match(/@([^/:?]+)/)?.[1] ?? "";
  if (prodUrl && dbHost(prodUrl) === dbHost(process.env.DATABASE_URL ?? "")) {
    throw new Error("Refusing to run: DATABASE_URL points at the production database.");
  }
  if (!CHROME) throw new Error("Chrome not found. Set CHROME_PATH.");
}

// ---------------------------------------------------------------- data

// A weekday ~7 weeks out, so real bookings and today's slots don't interfere.
const DAY = (() => {
  const d = new Date(Date.now() + 50 * 86400_000);
  while ([0, 6].includes(new Date(sydneyDateOf(d) + "T12:00:00Z").getUTCDay())) d.setUTCDate(d.getUTCDate() + 1);
  return sydneyDateOf(d);
})();
const at = (hhmm: string) => sydneyLocalToUtc(`${DAY}T${hhmm}`)!.toISOString();

async function variant(slug: string, durationMin = 60) {
  const v = await db.serviceVariant.findFirst({ where: { durationMin, service: { slug, active: true } }, select: { id: true } });
  if (!v) throw new Error(`No ${durationMin}-min variant for ${slug} on this database.`);
  return v.id;
}

async function cleanup(signedInEmail?: string) {
  const users = await db.user.findMany({ where: { email: { startsWith: "e2e.", endsWith: "@example.com" } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  if (ids.length) {
    await db.booking.deleteMany({ where: { clientId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } }); // cascades forms + consents
  }
  if (signedInEmail) {
    const u = await db.user.findUnique({ where: { email: signedInEmail }, select: { id: true } });
    if (u) {
      const { start, end } = { start: sydneyLocalToUtc(`${DAY}T00:00`)!, end: sydneyLocalToUtc(`${DAY}T23:59`)! };
      await db.booking.deleteMany({ where: { clientId: u.id, startsAt: { gte: start, lte: end } } });
    }
  }
}

// ---------------------------------------------------------------- page helpers

async function openConfirm(page: Page, slug: string, startsIso: string, partnerSlug?: string) {
  const qs = new URLSearchParams({ service: slug, variant: await variant(slug), starts: startsIso, date: DAY });
  if (partnerSlug) qs.set("partner", await variant(partnerSlug));
  await page.goto(`${BASE}/book/confirm?${qs}`);
  await page.locator("button", { hasText: "Confirm booking" }).first().waitFor();
  if (await page.getByText(/deposit required/i).count()) {
    throw new Error("Deposits are switched on for this dev site; this test doesn't cover card payment yet.");
  }
}

async function fillGuest(page: Page, first: string, last: string, email: string, phone: string) {
  await page.fill("#guestFirstName", first);
  await page.fill("#guestLastName", last);
  await page.fill("#guestEmail", email);
  await page.fill("#guestPhone", phone);
}

async function chooseLater(page: Page) {
  await page.locator("button", { hasText: /^\s*Later/ }).first().click();
}

/** Answers every visible-or-hidden Yes/No medical question with "No". */
async function answerNoToAll(page: Page) {
  // Some sit in collapsed sections; a DOM click still updates React state.
  for (const r of await page.locator('input[type=radio][name$="__yn"][value="no"]').all()) {
    await r.evaluate((el: HTMLInputElement) => { if (!el.checked) el.click(); });
  }
}

async function fillFullIntake(page: Page, opts: { pregnant?: "yes" | "no" | "skip"; weeks?: string }) {
  await answerNoToAll(page);
  if (await page.locator("#dob").isVisible()) await page.fill("#dob", "1990-05-01");
  if (await page.locator("select#gender").isVisible()) await page.selectOption("select#gender", { index: 2 });
  if (opts.pregnant === "yes") await page.check('input[name=pregnancy][value=on]');
  if (opts.pregnant === "no") await page.check('input[name=pregnancy][value=off]');
  if (opts.weeks) await page.fill("#pregnancyWeeks", opts.weeks);
  if (await page.locator("#emergencyContactName").isVisible()) {
    await page.fill("#emergencyContactName", "E2E Contact");
    await page.fill("#emergencyContactPhone", "0400000999");
  }
}

async function fillClaim(page: Page, irn: string) {
  const box = page.locator("input[name=claimWithHealthFund]");
  if (!(await box.isChecked())) await box.check();
  await page.selectOption("#healthFundName", { label: "HCF" });
  await page.fill("#healthFundMemberNumber", "E2E12345");
  await page.fill("#healthFundIrn", irn);
  await page.fill("#reasonForTreatment", "E2E lower back pain");
}

async function sign(page: Page) {
  const c = page.locator("canvas").first();
  await c.scrollIntoViewIfNeeded();
  const b = (await c.boundingBox())!;
  await page.mouse.move(b.x + 30, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(b.x + 30 + i * 18, b.y + b.height / 2 + (i % 2 ? -20 : 20));
  await page.mouse.up();
}

async function tickConsents(page: Page) {
  for (const cb of await page.locator("input[type=checkbox][required]").all()) {
    if (await cb.isVisible()) await cb.check();
  }
}

/** Press Confirm booking. Returns the booking reference, or null if the page didn't submit. */
async function submit(page: Page): Promise<{ ref: string | null; error: string }> {
  await page.locator("button", { hasText: "Confirm booking" }).first().click();
  const confirmInDialog = page.locator("[role=dialog] button", { hasText: /confirm/i });
  // Guests land on /book/confirmed, signed-in clients on /portal/bookings/confirmed.
  const CONFIRMED = /\/(book|portal\/bookings)\/confirmed/;
  const done = await Promise.race([
    page.waitForURL(CONFIRMED, { timeout: 25000 }).then(() => "ok").catch(() => "timeout"),
    confirmInDialog.first().waitFor({ timeout: 4000 }).then(() => "dialog").catch(() => new Promise((r) => setTimeout(() => r("timeout"), 25000))),
  ]);
  if (done === "dialog") {
    await confirmInDialog.first().click();
    await page.waitForURL(CONFIRMED, { timeout: 25000 }).catch(() => {});
  }
  const url = new URL(page.url());
  if (CONFIRMED.test(url.pathname)) {
    const ref = url.searchParams.get("ref") ?? (await page.locator("code", { hasText: /^MNL-/ }).first().innerText().catch(() => null));
    return { ref, error: "" };
  }
  const error = (await page.locator("[role=alert]").allInnerTexts()).join(" | ");
  return { ref: null, error };
}

const invalidFields = (page: Page) =>
  page.evaluate(() =>
    [...(document.querySelector("form")?.elements ?? [])]
      .filter((e) => (e as HTMLInputElement).willValidate && !(e as HTMLInputElement).checkValidity())
      .map((e) => (e as HTMLInputElement).name),
  );

// ---------------------------------------------------------------- scenarios

type Check = (cond: unknown, what: string) => void;
type Scenario = { name: string; run: (page: Page, check: Check) => Promise<void> };

async function bookingByRef(ref: string) {
  return db.booking.findUnique({
    where: { reference: ref },
    select: { id: true, clientId: true, claimWithHealthFund: true, coupleGroupId: true, client: { select: { email: true, healthFundIrn: true } } },
  });
}
const latestIntake = (userId: string) => db.intakeForm.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });

const scenarios: Scenario[] = [
  {
    name: "Guest · Relaxation (quick safety form)",
    run: async (page, check) => {
      await openConfirm(page, "relaxation-massage", at("10:00"));
      await fillGuest(page, "Relax", "Tester", E2E_EMAIL("relax"), "0400000101");
      await tickConsents(page);
      const { ref, error } = await submit(page);
      check(ref, `booked (${error || "no error shown"})`);
      if (!ref) return;
      const b = await bookingByRef(ref);
      check(b?.client.email === E2E_EMAIL("relax"), "booking is under the guest's own record");
      const i = await latestIntake(b!.clientId);
      check(i?.consentToTreat, "consent recorded");
    },
  },
  {
    name: "Guest · Remedial · health form later",
    run: async (page, check) => {
      await openConfirm(page, "remedial-massage", at("11:00"));
      await fillGuest(page, "Later", "Tester", E2E_EMAIL("later"), "0400000102");
      await chooseLater(page);
      await tickConsents(page);
      check((await invalidFields(page)).length === 0, `no hidden required field blocks the form (${(await invalidFields(page)).join(", ")})`);
      const { ref, error } = await submit(page);
      check(ref, `booked (${error || "no error shown"})`);
      if (!ref) return;
      const b = await bookingByRef(ref);
      check(b && !b.claimWithHealthFund, "no claim until the form is done");
      const i = await latestIntake(b!.clientId);
      check(i && !i.medicalConditions, "consent-only form saved (full form still needed)");
    },
  },
  {
    name: "Guest · Remedial · full form now + health fund claim",
    run: async (page, check) => {
      await openConfirm(page, "remedial-massage", at("12:00"));
      await fillGuest(page, "Claim", "Tester", E2E_EMAIL("claim"), "0400000103");
      await fillFullIntake(page, { pregnant: "no" });
      await fillClaim(page, "02");
      await tickConsents(page);
      await sign(page);
      const { ref, error } = await submit(page);
      check(ref, `booked (${error || "no error shown"})`);
      if (!ref) return;
      const b = await bookingByRef(ref);
      check(b?.claimWithHealthFund, "claim switched on");
      check(b?.client.healthFundIrn === "02", "individual number (IRN) saved on the client");
      const i = await latestIntake(b!.clientId);
      check(i?.healthFundIrn === "02" && i?.healthFundMemberNumber === "E2E12345", "fund details saved on the form");
      check(i?.pregnancy === false, "pregnancy answer saved (No)");
      check(i?.signatureDataUrl?.startsWith("data:image/png"), "signature saved");
      check(i?.medicalConditions === "None", "medical answers saved");
    },
  },
  {
    name: "Guest · Remedial · can't submit without answering pregnancy",
    run: async (page, check) => {
      await openConfirm(page, "remedial-massage", at("13:00"));
      await fillGuest(page, "Blocked", "Tester", E2E_EMAIL("blocked"), "0400000104");
      await fillFullIntake(page, { pregnant: "skip" });
      await fillClaim(page, "01");
      await tickConsents(page);
      await sign(page);
      check((await invalidFields(page)).includes("pregnancy"), "pregnancy question is flagged as required");
      await page.locator("button", { hasText: "Confirm booking" }).first().click();
      await page.waitForTimeout(2500);
      check(!page.url().includes("/book/confirmed"), "booking was not made");
    },
  },
  {
    name: "Guest · Pregnancy Massage (weeks + signature)",
    run: async (page, check) => {
      await openConfirm(page, "pregnancy-massage", at("14:00"));
      await fillGuest(page, "Preg", "Tester", E2E_EMAIL("preg"), "0400000105");
      await fillFullIntake(page, { weeks: "20" });
      await tickConsents(page);
      await sign(page);
      const { ref, error } = await submit(page);
      check(ref, `booked (${error || "no error shown"})`);
      if (!ref) return;
      const b = await bookingByRef(ref);
      const i = await latestIntake(b!.clientId);
      check(i?.pregnancy === true && i?.pregnancyWeeks === 20, "pregnant + 20 weeks saved");
    },
  },
  {
    name: "Guest · Remedial couple · partner gets their own record",
    run: async (page, check) => {
      await openConfirm(page, "remedial-massage", at("15:00"), "remedial-massage");
      await fillGuest(page, "Couple", "Booker", E2E_EMAIL("couple"), "0400000106");
      await chooseLater(page);
      await page.fill("#partnerName", "Couple Partner");
      await page.fill("#partnerEmail", E2E_EMAIL("partner"));
      await page.fill("#partnerPhone", "0400000107");
      await tickConsents(page);
      const { ref, error } = await submit(page);
      check(ref, `booked (${error || "no error shown"})`);
      if (!ref) return;
      const a = await bookingByRef(ref);
      const p = await bookingByRef(`${ref}-P`);
      check(a?.client.email === E2E_EMAIL("couple"), "booker's half is under the booker");
      check(p?.client.email === E2E_EMAIL("partner"), "partner's half is under the partner's own record");
      check(a?.coupleGroupId && a.coupleGroupId === p?.coupleGroupId, "both halves linked as a couple");
    },
  },
  {
    name: "Guest · Relaxation couple · partner name only",
    run: async (page, check) => {
      await openConfirm(page, "relaxation-massage", at("16:00"), "relaxation-massage");
      check((await page.locator("#partnerEmail").count()) === 0, "no partner email asked for relaxation");
      await fillGuest(page, "Relaxcouple", "Booker", E2E_EMAIL("relaxcouple"), "0400000108");
      await page.fill("#partnerName", "Relax Partner");
      await tickConsents(page);
      const { ref, error } = await submit(page);
      check(ref, `booked (${error || "no error shown"})`);
      if (!ref) return;
      const p = await bookingByRef(`${ref}-P`);
      check(p?.client.email === E2E_EMAIL("relaxcouple"), "partner half stays under the booker");
    },
  },
  {
    name: "Signed-in client · Relaxation",
    run: async (page, check) => {
      const email = process.env.SMOKE_CLIENT_EMAIL, password = process.env.SMOKE_CLIENT_PASSWORD;
      if (!email || !password) return check(false, "SMOKE_CLIENT_EMAIL / SMOKE_CLIENT_PASSWORD set in .env.smoke");
      await page.goto(`${BASE}/login`);
      await page.fill("input[type=email]", email);
      await page.fill("input[type=password]", password);
      await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.click("form button[type=submit]")]);
      await openConfirm(page, "relaxation-massage", at("17:00"));
      await tickConsents(page);
      const { ref, error } = await submit(page);
      check(ref, `booked (${error || "no error shown"})`);
      if (!ref) return;
      const b = await bookingByRef(ref);
      check(b?.client.email === email.toLowerCase(), "booking is under the signed-in account");
    },
  },
];

// ---------------------------------------------------------------- runner

async function main() {
  refuseUnsafeTarget();
  console.log(`Booking page test · ${BASE} · test day ${DAY}\n`);
  await cleanup(process.env.SMOKE_CLIENT_EMAIL);
  const browser = await chromium.launch({ executablePath: CHROME, headless: !HEADED });
  let failed = 0;
  try {
    for (const s of scenarios) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const page = await ctx.newPage();
      page.setDefaultTimeout(30000);
      const lines: string[] = [];
      let ok = true;
      const check: Check = (cond, what) => {
        lines.push(`    ${cond ? "✓" : "✗"} ${what}`);
        if (!cond) ok = false;
      };
      try {
        await s.run(page, check);
      } catch (e) {
        ok = false;
        lines.push(`    ✗ crashed: ${(e as Error).message.split("\n")[0]}`);
        await page.screenshot({ path: `booking-e2e-fail-${scenarios.indexOf(s) + 1}.png`, fullPage: true }).catch(() => {});
      }
      if (!ok) failed++;
      console.log(`${ok ? "PASS" : "FAIL"}  ${s.name}\n${lines.join("\n")}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await cleanup(process.env.SMOKE_CLIENT_EMAIL);
    await db.$disconnect();
  }
  console.log(`\n${scenarios.length - failed}/${scenarios.length} scenarios passed`);
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : e);
  await db.$disconnect().catch(() => {});
  process.exit(1);
});
