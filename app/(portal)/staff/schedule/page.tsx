import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffShell, DateNav } from "@/components/staff-shell";
import { ScheduleGrid } from "@/components/schedule-grid";
import { startOfDay, endOfDay, parseISO } from "date-fns";

export const metadata = { title: "Calendar" };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = (await auth())!;
  const sp = await searchParams;
  const day = sp.date ? parseISO(sp.date) : new Date();
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  const dow = day.getDay();

  const [therapistsRaw, bookings] = await Promise.all([
    db.therapist.findMany({
      where: { active: true },
      include: {
        user: { select: { name: true } },
        availability: { where: { dayOfWeek: dow } },
      },
      orderBy: { user: { name: "asc" } },
    }),
    db.booking.findMany({
      where: {
        startsAt: { gte: dayStart, lte: dayEnd },
        status: { in: ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"] },
      },
      include: {
        service: true,
        variant: true,
        client: { select: { name: true, phone: true } },
      },
      orderBy: { startsAt: "asc" },
    }),
  ]);

  const therapists = therapistsRaw.map((t) => {
    const slot = t.availability[0];
    return {
      id: t.id,
      name: t.user.name,
      initials: initials(t.user.name),
      isWorking: !!slot,
      startMin: slot?.startMin,
      endMin: slot?.endMin,
    };
  });

  return (
    <StaffShell
      user={session.user}
      topbar={<DateNav date={day} basePath="/staff/schedule" />}
    >
      <div className="p-4">
        {therapists.length === 0 ? (
          <div className="rounded-md border bg-card p-8 text-sm text-muted-foreground text-center">
            No active therapists. Add one in Therapists.
          </div>
        ) : (
          <ScheduleGrid date={day} therapists={therapists} bookings={bookings} />
        )}
      </div>
    </StaffShell>
  );
}
