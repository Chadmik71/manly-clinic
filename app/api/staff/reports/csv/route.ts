import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { format, subDays } from "date-fns";
import type { Prisma } from "@prisma/client";

function csvEscape(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const fromStr = url.searchParams.get("from");
  const toStr = url.searchParams.get("to");
  const therapist = url.searchParams.get("therapist") ?? "";
  const service = url.searchParams.get("service") ?? "";
  const fund = url.searchParams.get("fund") ?? "";
  const status = url.searchParams.get("status") ?? "";
  const claim = url.searchParams.get("claim") ?? "";

  const today = new Date();
  const fromDate = fromStr ? new Date(fromStr) : subDays(today, 30);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = toStr ? new Date(toStr) : today;
  toDate.setHours(23, 59, 59, 999);

  const where: Prisma.BookingWhereInput = {
    startsAt: { gte: fromDate, lte: toDate },
    ...(therapist ? { therapistId: therapist } : {}),
    ...(service ? { serviceId: service } : {}),
    ...(status ? { status } : {}),
    ...(claim === "yes"
      ? { claimWithHealthFund: true }
      : claim === "no"
        ? { claimWithHealthFund: false }
        : {}),
  };

  const bookings = await db.booking.findMany({
    where,
    include: {
      service: true,
      variant: true,
      client: { select: { name: true, email: true, phone: true } },
      therapist: { include: { user: { select: { name: true } } } },
    },
    orderBy: { startsAt: "asc" },
  });

  const userIds = [...new Set(bookings.map((b) => b.clientId))];
  const intakes = await db.intakeForm.findMany({
    where: { userId: { in: userIds } },
    orderBy: { createdAt: "desc" },
  });
  function fundForBooking(clientId: string, when: Date): {
    fund: string | null;
    member: string | null;
    reason: string | null;
  } {
    const c = intakes.find(
      (i) => i.userId === clientId && i.createdAt <= when,
    );
    return {
      fund: c?.healthFundName ?? null,
      member: c?.healthFundMemberNumber ?? null,
      reason: c?.reasonForTreatment ?? null,
    };
  }

  const filtered = bookings.filter((b) => {
    if (!fund) return true;
    if (!b.claimWithHealthFund) return false;
    return fundForBooking(b.clientId, b.startsAt).fund === fund;
  });

  await audit({
    userId: session.user.id,
    action: "EXPORT_REPORT_CSV",
    metadata: {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      count: filtered.length,
    },
  });

  const headerRow = [
    "Reference",
    "Date",
    "Time",
    "Status",
    "Client name",
    "Client email",
    "Client phone",
    "Service",
    "Duration (min)",
    "Therapist",
    "Price (AUD)",
    "Health fund claim",
    "Health fund",
    "Member number",
    "Reason for treatment",
    "Notes",
  ];
  const lines: string[] = [headerRow.join(",")];
  for (const b of filtered) {
    const fb = fundForBooking(b.clientId, b.startsAt);
    const row = [
      b.reference,
      format(b.startsAt, "yyyy-MM-dd"),
      format(b.startsAt, "HH:mm"),
      b.status,
      b.client.name,
      b.client.email,
      b.client.phone ?? "",
      b.service.name,
      b.variant.durationMin,
      b.therapist?.user.name ?? "",
      (b.priceCentsAtBooking / 100).toFixed(2),
      b.claimWithHealthFund ? "yes" : "no",
      b.claimWithHealthFund ? (fb.fund ?? "") : "",
      b.claimWithHealthFund ? (fb.member ?? "") : "",
      b.claimWithHealthFund ? (fb.reason ?? "") : "",
      b.notes ?? "",
    ];
    lines.push(row.map(csvEscape).join(","));
  }
  const body = lines.join("\r\n");
  const filename = `clinic-report_${format(fromDate, "yyyyMMdd")}_${format(toDate, "yyyyMMdd")}.csv`;

  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
