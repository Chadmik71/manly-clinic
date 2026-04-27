import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const [user, bookings, intakes, consents] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
    }),
    db.booking.findMany({
      where: { clientId: userId },
      include: { service: { select: { name: true } }, variant: true },
    }),
    db.intakeForm.findMany({ where: { userId } }),
    db.consentRecord.findMany({ where: { userId } }),
  ]);

  await audit({
    userId,
    action: "DATA_EXPORT",
    metadata: { bookings: bookings.length, intakes: intakes.length },
  });

  const body = JSON.stringify(
    { exportedAt: new Date().toISOString(), user, bookings, intakes, consents },
    null,
    2,
  );
  return new NextResponse(body, {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="my-clinic-data.json"`,
    },
  });
}
