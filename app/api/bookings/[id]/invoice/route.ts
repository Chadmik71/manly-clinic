import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { renderInvoicePdf, type InvoiceData } from "@/lib/invoice";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const b = await db.booking.findUnique({
    where: { id },
    include: {
      service: true,
      variant: true,
      client: true,
      therapist: { include: { user: true } },
    },
  });
  if (!b) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = b.clientId === session.user.id;
  const isStaff =
    session.user.role === "STAFF" || session.user.role === "ADMIN";
  if (!isOwner && !isStaff)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const intake = b.claimWithHealthFund
    ? await db.intakeForm.findFirst({
        where: { userId: b.clientId, healthFundName: { not: null } },
        orderBy: { createdAt: "desc" },
      })
    : null;

  const data: InvoiceData = {
    reference: b.reference,
    status: b.status,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
    serviceName: b.service.name,
    durationMin: b.variant.durationMin,
    priceCents: b.priceCentsAtBooking,
    paidCents: b.paidCents,
    cancellationFeeCents: b.cancellationFeeCents,
    client: {
      name: b.client.name,
      email: b.client.email,
      phone: b.client.phone,
    },
    therapist: b.therapist
      ? {
          name: b.therapist.user.name,
          providerNumber: b.therapist.providerNumber,
          associationName: b.therapist.associationName,
        }
      : null,
    healthFund:
      intake && intake.healthFundName && intake.healthFundMemberNumber
        ? {
            name: intake.healthFundName,
            memberNumber: intake.healthFundMemberNumber,
            reasonForTreatment: intake.reasonForTreatment ?? "—",
          }
        : null,
  };

  const buffer = await renderInvoicePdf(data);

  await audit({
    userId: session.user.id,
    action: "DOWNLOAD_INVOICE",
    resource: `Booking:${b.id}`,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="invoice-${b.reference}.pdf"`,
    },
  });
}
