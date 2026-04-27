// Ensures the seeded client@example.com has at least one upcoming booking
// so the smoke tests can exercise booking-specific endpoints (invoice,
// reschedule, deposit). Idempotent.
import { PrismaClient } from "@prisma/client";
import { bookingReference } from "../lib/utils";

const db = new PrismaClient();

async function main() {
  const client = await db.user.findUnique({
    where: { email: "client@example.com" },
  });
  if (!client) {
    console.log("client@example.com not found — run db:seed first");
    return;
  }
  const existing = await db.booking.findFirst({
    where: {
      clientId: client.id,
      startsAt: { gte: new Date() },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
  });
  if (existing) {
    console.log("Client already has upcoming booking", existing.reference);
    return;
  }

  const variant = await db.serviceVariant.findFirst({
    where: { service: { slug: "remedial-massage" }, durationMin: 60 },
    include: { service: true },
  });
  const therapist = await db.therapist.findFirst({
    where: { active: true },
    include: { user: true },
  });
  if (!variant || !therapist) {
    console.log("Missing seed data (variant or therapist)");
    return;
  }

  // Tomorrow at 14:00
  const startsAt = new Date();
  startsAt.setDate(startsAt.getDate() + 1);
  startsAt.setHours(14, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + variant.durationMin * 60_000);

  const booking = await db.booking.create({
    data: {
      reference: bookingReference(),
      clientId: client.id,
      serviceId: variant.serviceId,
      variantId: variant.id,
      therapistId: therapist.id,
      startsAt,
      endsAt,
      status: "CONFIRMED",
      priceCentsAtBooking: variant.priceCents,
    },
  });
  console.log(`Created booking ${booking.reference} for client@example.com tomorrow 2:00 PM`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
