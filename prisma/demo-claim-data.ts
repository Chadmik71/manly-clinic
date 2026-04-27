// Adds intake forms with health-fund details for some demo clients,
// then marks any of their existing remedial-massage bookings as claims.
// Idempotent.
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const FUND_BY_EMAIL: Record<string, { fund: string; member: string }> = {
  "mitchell@example.com": { fund: "Medibank", member: "MED12345A" },
  "tracy@example.com": { fund: "Bupa", member: "BUP98765B" },
  "elizabeth@example.com": { fund: "HCF", member: "HCF55555C" },
  "fiona@example.com": { fund: "NIB", member: "NIB22220D" },
};

async function main() {
  for (const [email, { fund, member }] of Object.entries(FUND_BY_EMAIL)) {
    const u = await db.user.findUnique({ where: { email } });
    if (!u) continue;
    const existing = await db.intakeForm.findFirst({
      where: { userId: u.id, healthFundName: fund },
    });
    if (!existing) {
      await db.intakeForm.create({
        data: {
          userId: u.id,
          healthFundName: fund,
          healthFundMemberNumber: member,
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
    // Flag this client's eligible bookings as claims
    const updated = await db.booking.updateMany({
      where: {
        clientId: u.id,
        service: { healthFundEligible: true },
        claimWithHealthFund: false,
      },
      data: { claimWithHealthFund: true },
    });
    console.log(`${email}: intake ensured, ${updated.count} bookings flagged as ${fund} claim`);
  }
}
main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
