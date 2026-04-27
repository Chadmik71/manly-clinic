// Adds 4 demo therapists + a day of demo bookings on TODAY.
// Idempotent on therapists; appends bookings each run.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { bookingReference } from "../lib/utils.js";

const db = new PrismaClient();

const STAFF = [
  { name: "Anna Nguyen", email: "anna@clinic.local" },
  { name: "Beth Lawson", email: "beth@clinic.local" },
  { name: "Chloe Rivera", email: "chloe@clinic.local" },
  { name: "Daniel Park", email: "daniel@clinic.local" },
];

async function main() {
  const pw = await bcrypt.hash("staff123", 10);
  const therapistIds: string[] = [];
  for (const s of STAFF) {
    const u = await db.user.upsert({
      where: { email: s.email },
      update: {},
      create: { email: s.email, name: s.name, passwordHash: pw, role: "STAFF" },
    });
    const t = await db.therapist.upsert({
      where: { userId: u.id },
      update: { active: true },
      create: {
        userId: u.id,
        active: true,
        qualifications: "Diploma of Remedial Massage",
        providerNumber: `AAMT-${Math.floor(100000 + Math.random() * 900000)}`,
        associationName: "AAMT",
      },
    });
    therapistIds.push(t.id);
    // 7-day, 9am–8:30pm
    for (let day = 0; day < 7; day++) {
      const exists = await db.availability.findFirst({
        where: { therapistId: t.id, dayOfWeek: day },
      });
      if (!exists) {
        await db.availability.create({
          data: {
            therapistId: t.id,
            dayOfWeek: day,
            startMin: 9 * 60,
            endMin: 20 * 60 + 30,
          },
        });
      }
    }
  }

  // Make sure we have a few clients
  const clientPw = await bcrypt.hash("client123", 10);
  const clients = [
    { email: "mitchell@example.com", name: "Mitchell", phone: "0420 254 400" },
    { email: "tracy@example.com", name: "Tracy Black", phone: "0405 595 819" },
    { email: "elizabeth@example.com", name: "Elizabeth Harvey", phone: "0420 615 992" },
    { email: "darryn@example.com", name: "Darryn Hewett", phone: "0407 282 957" },
    { email: "fiona@example.com", name: "Fiona Turner", phone: "0438 168 055" },
    { email: "tom@example.com", name: "Tom", phone: "0411 573 766" },
    { email: "paul@example.com", name: "Paul Wilkinson", phone: "0411 778 230" },
  ];
  const clientIds: string[] = [];
  for (const c of clients) {
    const u = await db.user.upsert({
      where: { email: c.email },
      update: { phone: c.phone },
      create: { ...c, role: "CLIENT", passwordHash: clientPw },
    });
    clientIds.push(u.id);
  }

  // Variants we'll book
  const remedial60 = await db.serviceVariant.findFirst({
    where: { service: { slug: "remedial-massage" }, durationMin: 60 },
  });
  const remedial45 = await db.serviceVariant.findFirst({
    where: { service: { slug: "remedial-massage" }, durationMin: 45 },
  });
  const thai60 = await db.serviceVariant.findFirst({
    where: { service: { slug: "thai-massage-medium-hard" }, durationMin: 60 },
  });
  const relax60 = await db.serviceVariant.findFirst({
    where: { service: { slug: "relaxation-massage" }, durationMin: 60 },
  });
  const relax90 = await db.serviceVariant.findFirst({
    where: { service: { slug: "relaxation-massage" }, durationMin: 90 },
  });

  const today = new Date();
  function at(h: number, m: number): Date {
    const d = new Date(today);
    d.setHours(h, m, 0, 0);
    return d;
  }

  const layout: Array<{
    t: number; // therapist index
    c: number; // client index
    h: number; m: number; // start
    v: typeof remedial60;
  }> = [
    { t: 0, c: 0, h: 9, m: 0, v: remedial45 },
    { t: 0, c: 1, h: 11, m: 0, v: relax60 },
    { t: 0, c: 4, h: 13, m: 0, v: remedial60 },
    { t: 0, c: 5, h: 15, m: 0, v: relax90 },
    { t: 1, c: 1, h: 9, m: 30, v: thai60 },
    { t: 1, c: 2, h: 12, m: 0, v: remedial45 },
    { t: 1, c: 6, h: 14, m: 0, v: relax60 },
    { t: 2, c: 3, h: 10, m: 0, v: relax90 },
    { t: 2, c: 0, h: 13, m: 30, v: remedial60 },
    { t: 3, c: 5, h: 9, m: 30, v: thai60 },
    { t: 3, c: 4, h: 11, m: 30, v: remedial45 },
    { t: 3, c: 6, h: 16, m: 0, v: relax60 },
  ];

  // Seed intake forms for some clients with health fund details
  const FUND_DETAILS = [
    { idx: 0, fund: "Medibank", member: "MED12345A" },
    { idx: 1, fund: "Bupa", member: "BUP98765B" },
    { idx: 2, fund: "HCF", member: "HCF55555C" },
    { idx: 4, fund: "NIB", member: "NIB22220D" },
  ];
  for (const fd of FUND_DETAILS) {
    const existing = await db.intakeForm.findFirst({
      where: { userId: clientIds[fd.idx], healthFundName: fd.fund },
    });
    if (!existing) {
      await db.intakeForm.create({
        data: {
          userId: clientIds[fd.idx],
          healthFundName: fd.fund,
          healthFundMemberNumber: fd.member,
          reasonForTreatment: "Lower back tension and posture rehab",
          medicalConditions: "None",
          medications: "None",
          allergies: "None",
          injuries: "None",
          emergencyContactName: "Next of Kin",
          emergencyContactPhone: "0400 000 000",
          consentToTreat: true,
          consentToStore: true,
          signedAt: new Date(),
        },
      });
    }
  }

  // Map: clients who have intake => those bookings will be marked as claims
  // (only on health-fund-eligible services)
  const fundIndices = new Set(FUND_DETAILS.map((f) => f.idx));

  let added = 0;
  for (const L of layout) {
    if (!L.v) continue;
    const startsAt = at(L.h, L.m);
    const endsAt = new Date(startsAt.getTime() + L.v.durationMin * 60_000);
    // skip if overlapping booking already exists for that therapist
    const conflict = await db.booking.findFirst({
      where: {
        therapistId: therapistIds[L.t],
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
    });
    if (conflict) continue;
    const variantWithService = await db.serviceVariant.findUnique({
      where: { id: L.v.id },
      include: { service: { select: { healthFundEligible: true } } },
    });
    const claim =
      fundIndices.has(L.c) &&
      !!variantWithService?.service.healthFundEligible;
    await db.booking.create({
      data: {
        reference: bookingReference(),
        clientId: clientIds[L.c],
        serviceId: L.v.serviceId,
        variantId: L.v.id,
        therapistId: therapistIds[L.t],
        startsAt,
        endsAt,
        status: "CONFIRMED",
        priceCentsAtBooking: L.v.priceCents,
        claimWithHealthFund: claim,
      },
    });
    added++;
  }
  console.log(`Added ${added} demo bookings for today.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
