import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { CLINIC } from "@/lib/clinic";

// Format a Date as UTC "yyyyMMddTHHmmssZ" for iCalendar DTSTART/DTEND/DTSTAMP.
function icsUtc(d: Date): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// Per RFC 5545: backslash, semicolon, comma, and newline get escaped in TEXT
// properties. Long lines should also be folded at 75 octets, but every
// modern calendar app accepts longer lines so we skip folding to keep this
// readable.
function icsEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Public iCalendar download for a booking. The booking reference (short
 * human-readable code) OR the CUID both work as the [id] param so a
 * customer can link to it from the confirmation page without us exposing
 * the CUID anywhere. No PII in the file — just service name, time, and
 * the clinic address — so this is intentionally unauthenticated.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Missing booking id" }, { status: 400 });
  }

  const b = await db.booking.findFirst({
    where: { OR: [{ id }, { reference: id }] },
    include: { service: { select: { name: true } }, variant: { select: { durationMin: true } } },
  });
  if (!b) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (b.status === "CANCELLED" || b.status === "NO_SHOW") {
    return NextResponse.json(
      { error: "This booking has been cancelled." },
      { status: 410 },
    );
  }

  const addr = `${CLINIC.address.line1}, ${CLINIC.address.suburb} ${CLINIC.address.state} ${CLINIC.address.postcode}`;
  const summary = `${b.service.name} (${b.variant.durationMin} min) — ${CLINIC.name}`;
  const description = [
    `Booking reference: ${b.reference}`,
    `Clinic: ${CLINIC.name}`,
    `Phone: ${CLINIC.phone}`,
    `Please arrive 5 minutes early.`,
  ].join("\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${CLINIC.name}//Booking//EN`,
    "METHOD:PUBLISH",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:booking-${b.reference}@${CLINIC.mailDomain}`,
    `DTSTAMP:${icsUtc(new Date())}`,
    `DTSTART:${icsUtc(b.startsAt)}`,
    `DTEND:${icsUtc(b.endsAt)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `LOCATION:${icsEscape(addr)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Massage appointment in 1 hour",
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="manly-remedial-${b.reference}.ics"`,
      "Cache-Control": "private, no-store",
    },
  });
}
