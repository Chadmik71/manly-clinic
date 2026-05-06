import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { StaffShell } from "@/components/staff-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { EditBookingForm } from "./edit-form";
import { updateBooking } from "../actions";
import { SYDNEY_TZ } from "@/lib/time";

export const metadata = { title: "Edit booking" };

// Format a Date as YYYY-MM-DDTHH:mm in Sydney calendar time so the
// datetime-local input pre-fills correctly (Vercel server is UTC; raw
// toISOString would surface the wrong wall-clock time for our admins).
function toSydneyLocal(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SYDNEY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  // Intl returns hour as "24" for midnight — normalise to "00".
  const hh = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hh}:${get("minute")}`;
}

export default async function EditBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  ) {
    redirect("/login");
  }
  const { id } = await params;

  const [booking, services, slots] = await Promise.all([
    db.booking.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            isWalkIn: true,
          },
        },
        service: { select: { id: true, name: true } },
        variant: {
          select: { id: true, durationMin: true, priceCents: true },
        },
        slot: { select: { id: true, label: true } },
      },
    }),
    db.service.findMany({
      where: { active: true },
      include: { variants: { orderBy: { durationMin: "asc" } } },
      orderBy: { name: "asc" },
    }),
    db.slot.findMany({
      where: { active: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, label: true },
    }),
  ]);

  if (!booking) notFound();

  return (
    <StaffShell
      user={session.user}
      topbar={
        <span className="text-foreground font-medium">
          Edit booking {booking.reference}
        </span>
      }
    >
      <div className="p-4 max-w-3xl space-y-3">
        <Link
          href={`/staff/bookings/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to booking
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Edit booking</CardTitle>
            <CardDescription>
              Reschedule, change service or slot, fix walk-in client details, or
              update internal notes. Changes here update the customer-facing
              booking. Status, clinical notes, and the assigned therapist for
              the clinical record are managed on the booking detail page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditBookingForm
              action={updateBooking}
              booking={{
                id: booking.id,
                reference: booking.reference,
                serviceId: booking.serviceId,
                variantId: booking.variantId,
                startsAtLocal: toSydneyLocal(booking.startsAt),
                slotId: booking.slotId ?? "",
                notes: booking.notes ?? "",
                client: booking.client,
              }}
              services={services.map((s) => ({
                id: s.id,
                name: s.name,
                variants: s.variants.map((v) => ({
                  id: v.id,
                  durationMin: v.durationMin,
                  priceCents: v.priceCents,
                })),
              }))}
              slots={slots}
            />
          </CardContent>
        </Card>
      </div>
    </StaffShell>
  );
}
