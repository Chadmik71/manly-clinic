import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { getDistinctSlotTimes } from "@/lib/booking";
import { format, startOfDay, addDays, parseISO } from "date-fns";
import { ReschedulePicker } from "./reschedule-picker";
import { rescheduleBooking } from "./actions";
import { formatPrice, formatDuration } from "@/lib/utils";

export const metadata = { title: "Reschedule booking" };

export default async function ReschedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const sp = await searchParams;
  const b = await db.booking.findUnique({
    where: { id },
    include: { service: true, variant: true },
  });
  if (!b || b.clientId !== session.user.id) notFound();
  if (b.status !== "PENDING" && b.status !== "CONFIRMED") {
    redirect("/portal/bookings");
  }

  const date = sp.date ? parseISO(sp.date) : new Date();
  const slots = await getDistinctSlotTimes({
    date,
    durationMin: b.variant.durationMin,
  });
  // Exclude the current booking's slot from "occupied" — it's still showing
  // as a conflict for itself otherwise; but since the slot picker filters by
  // booking conflict per therapist and this booking IS one of the bookings,
  // we'd lose the option to keep the same time. The reschedule action handles
  // that case explicitly. The picker will simply not show the current slot if
  // it's filtered out due to its own booking; clients are told to pick a
  // different time anyway.
  const today = startOfDay(new Date());
  const days = Array.from({ length: 14 }).map((_, i) => addDays(today, i));

  return (
    <PortalShell title="Reschedule" user={session.user} section="client">
      <Link
        href="/portal/bookings"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← My bookings
      </Link>

      <Card className="mt-3 mb-6">
        <CardHeader>
          <CardTitle>{b.service.name}</CardTitle>
          <CardDescription>
            Currently booked {format(b.startsAt, "EEE d MMM, h:mm a")} ·{" "}
            {formatDuration(b.variant.durationMin)} ·{" "}
            {formatPrice(b.priceCentsAtBooking)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
            {days.map((d) => {
              const iso = format(d, "yyyy-MM-dd");
              const selected = format(date, "yyyy-MM-dd") === iso;
              return (
                <Link
                  key={iso}
                  href={`/portal/bookings/${b.id}/reschedule?date=${iso}`}
                  className={`shrink-0 rounded-md border px-3 py-2 text-center text-sm transition-colors ${
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  }`}
                >
                  <div className="text-xs opacity-80">{format(d, "EEE")}</div>
                  <div className="font-semibold">{format(d, "d MMM")}</div>
                </Link>
              );
            })}
          </div>
          <ReschedulePicker
            bookingId={b.id}
            slots={slots.map((s) => s.toISOString())}
            action={rescheduleBooking}
          />
        </CardContent>
      </Card>
    </PortalShell>
  );
}
