himport { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

type Variant = { duration: number; price: number };

const services: Array<{
  slug: string;
  name: string;
  category: string;
  description: string;
  healthFundEligible?: boolean;
  variants: Variant[];
}> = [
  {
    slug: "remedial-massage",
    name: "Remedial Massage",
    category: "THERAPEUTIC",
    description:
      "Targeted treatment for muscular pain, tension, postural issues and rehabilitation. Health fund rebates may apply.",
    healthFundEligible: true,
    variants: [
      { duration: 45, price: 9500 },
      { duration: 60, price: 11500 },
      { duration: 90, price: 16500 },
      { duration: 120, price: 23000 },
    ],
  },
  {
    slug: "deep-tissue-massage",
    name: "Deep Tissue Massage",
    category: "THERAPEUTIC",
    description:
      "Sustained pressure applied to deeper layers of muscle and connective tissue to release chronic tension.",
    variants: [
      { duration: 30, price: 7000 },
      { duration: 45, price: 9500 },
      { duration: 60, price: 11500 },
      { duration: 90, price: 16500 },
      { duration: 120, price: 23000 },
    ],
  },
  {
    slug: "thai-massage-soft",
    name: "Thai Massage (Soft)",
    category: "THERAPEUTIC",
    description:
      "Traditional Thai assisted-stretch and acupressure, gentle pressure suited for first-time clients.",
    variants: [
      { duration: 30, price: 6500 },
      { duration: 45, price: 8500 },
      { duration: 60, price: 10500 },
      { duration: 90, price: 15500 },
      { duration: 120, price: 21000 },
    ],
  },
  {
    slug: "thai-massage-medium-hard",
    name: "Thai Massage (Medium / Hard)",
    category: "THERAPEUTIC",
    description:
      "Firmer Thai bodywork with deeper pressure and fuller range stretches.",
    variants: [
      { duration: 30, price: 7000 },
      { duration: 45, price: 9500 },
      { duration: 60, price: 11500 },
      { duration: 90, price: 16500 },
      { duration: 120, price: 23000 },
    ],
  },
  {
    slug: "relaxation-massage",
    name: "Relaxation Massage",
    category: "RELAXATION",
    description:
      "Long, flowing strokes to ease tension and improve circulation.",
    variants: [
      { duration: 30, price: 6500 },
      { duration: 45, price: 8500 },
      { duration: 60, price: 10500 },
      { duration: 90, price: 15500 },
      { duration: 120, price: 21000 },
    ],
  },
  {
    slug: "aromatherapy-oil-massage",
    name: "Aromatherapy Oil Massage",
    category: "RELAXATION",
    description:
      "Relaxation massage using therapeutic-grade essential oil blends.",
    variants: [
      { duration: 30, price: 7000 },
      { duration: 45, price: 9500 },
      { duration: 60, price: 11500 },
      { duration: 90, price: 16500 },
      { duration: 120, price: 23000 },
    ],
  },
  {
    slug: "coconut-oil-massage",
    name: "Coconut Oil Massage",
    category: "RELAXATION",
    description:
      "Gentle relaxation massage with cold-pressed coconut oil. Suitable for sensitive skin.",
    variants: [
      { duration: 30, price: 7000 },
      { duration: 45, price: 9500 },
      { duration: 60, price: 11500 },
      { duration: 90, price: 16500 },
      { duration: 120, price: 23000 },
    ],
  },
  {
    slug: "hot-stone-massage",
    name: "Hot Stone Massage",
    category: "SPECIALTY",
    description:
      "Heated basalt stones placed on the body to release deep tension.",
    variants: [
      { duration: 60, price: 12000 },
      { duration: 90, price: 17000 },
      { duration: 120, price: 23500 },
    ],
  },
  {
    slug: "foot-reflexology",
    name: "Foot Reflexology",
    category: "SPECIALTY",
    description:
      "Pressure-point therapy applied to the feet to support whole-body wellbeing.",
    variants: [
      { duration: 30, price: 7000 },
      { duration: 45, price: 9500 },
      { duration: 60, price: 11500 },
      { duration: 90, price: 16500 },
      { duration: 120, price: 23000 },
    ],
  },
  {
    slug: "pregnancy-massage",
    name: "Pregnancy Massage",
    category: "SPECIALTY",
    description:
      "Side-lying pregnancy massage for second and third trimester. Obstetrician clearance recommended.",
    variants: [
      { duration: 30, price: 7000 },
      { duration: 45, price: 9500 },
      { duration: 60, price: 11500 },
      { duration: 90, price: 16500 },
      { duration: 120, price: 23000 },
    ],
  },
  {
    slug: "sport-boxing-oil-massage",
    name: "Sport / Boxing Oil Massage",
    category: "THERAPEUTIC",
    description:
      "Pre- and post-event sports massage focused on muscle recovery, mobility and injury prevention.",
    variants: [
      { duration: 30, price: 7000 },
      { duration: 45, price: 9500 },
      { duration: 60, price: 11500 },
      { duration: 90, price: 16500 },
      { duration: 120, price: 23000 },
    ],
  },
  {
    slug: "body-scrub",
    name: "Body Scrub",
    category: "SPECIALTY",
    description:
      "Full-body exfoliation treatment to remove dead skin and stimulate circulation.",
    variants: [
      { duration: 30, price: 7000 },
      { duration: 45, price: 9500 },
      { duration: 60, price: 11500 },
      { duration: 90, price: 16500 },
      { duration: 120, price: 23000 },
    ],
  },
  {
    slug: "head-neck-shoulders",
    name: "Head, Neck & Shoulders",
    category: "ADD_ON",
    description: "Short focused treatment, ideal as an add-on or quick session.",
    variants: [
      { duration: 10, price: 2000 },
      { duration: 15, price: 2500 },
      { duration: 20, price: 3000 },
    ],
  },
  {
    slug: "cupping-therapy",
    name: "Cupping Therapy",
    category: "SPECIALTY",
    description:
      "Vacuum cupping to release fascia and improve circulation. Available standalone or with remedial.",
    variants: [
      { duration: 20, price: 4900 },
      { duration: 75, price: 13900 }, // remedial + cupping combo
    ],
  },
];

async function main() {
  console.log("Seeding services...");
  for (const s of services) {
    const created = await db.service.upsert({
      where: { slug: s.slug },
      update: {
        name: s.name,
        category: s.category,
        description: s.description,
        healthFundEligible: s.healthFundEligible ?? false,
      },
      create: {
        slug: s.slug,
        name: s.name,
        category: s.category,
        description: s.description,
        healthFundEligible: s.healthFundEligible ?? false,
      },
    });
    for (const v of s.variants) {
      await db.serviceVariant.upsert({
        where: {
          serviceId_durationMin: {
            serviceId: created.id,
            durationMin: v.duration,
          },
        },
        update: { priceCents: v.price },
        create: {
          serviceId: created.id,
          durationMin: v.duration,
          priceCents: v.price,
        },
      });
    }
  }

  console.log("Seeding admin user...");
  const adminPass = await bcrypt.hash("admin123", 10);
  await db.user.upsert({
    where: { email: "admin@clinic.local" },
    update: {},
    create: {
      email: "admin@clinic.local",
      passwordHash: adminPass,
      name: "Clinic Admin",
      role: "ADMIN",
    },
  });

  console.log("Seeding sample therapist...");
  const therapistPass = await bcrypt.hash("staff123", 10);
  const therapistUser = await db.user.upsert({
    where: { email: "therapist@clinic.local" },
    update: {},
    create: {
      email: "therapist@clinic.local",
      passwordHash: therapistPass,
      name: "Anna Nguyen",
      role: "STAFF",
    },
  });
  const therapist = await db.therapist.upsert({
    where: { userId: therapistUser.id },
    update: {},
    create: {
      userId: therapistUser.id,
      bio: "Senior remedial therapist with 12+ years of clinical practice.",
      qualifications: "Diploma of Remedial Massage, AAMT member",
      providerNumber: "AAMT-000123",
      associationName: "AAMT",
      active: true,
    },
  });
  // 7 days, 9:00-20:30
  for (let day = 0; day < 7; day++) {
    const exists = await db.availability.findFirst({
      where: { therapistId: therapist.id, dayOfWeek: day },
    });
    if (!exists) {
      await db.availability.create({
        data: {
          therapistId: therapist.id,
          dayOfWeek: day,
          startMin: 9 * 60,
          endMin: 20 * 60 + 30,
        },
      });
    }
  }

  console.log("Seeding sample client...");
  const clientPass = await bcrypt.hash("client123", 10);
  await db.user.upsert({
    where: { email: "client@example.com" },
    update: {},
    create: {
      email: "client@example.com",
      passwordHash: clientPass,
      name: "Sample Client",
      phone: "0400 000 000",
      role: "CLIENT",
    },
  });

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
