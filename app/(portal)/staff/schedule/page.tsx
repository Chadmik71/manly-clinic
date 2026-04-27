import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffShell, DateNav } from "@/components/staff-shell";
import { ScheduleGrid } from "@/components/schedule-grid";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export const metadata = { title: "Calendar" };

const SYDNEY_TZ = "Australia/Sydney";

// Today in Sydney as YYYY-MM-DD
function todayInSydney(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SYDNEY_TZ }).format(new Date());
}

// Get Sydney UTC offset hours (+10 AEST or +11 AEDT) for a given date
function sydneyOffsetHours(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SYDNEY_TZ,
    timeZoneName: "longOffset",
  }).formatToParts(date);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+10:00";
  const m = tz.match(/GMT([+-])(\d+)(?::(\d+))?/);
  if (!m) return 10;
  const sign = m[1] === "+" ? 1 : -1;
  const h = parseInt(m[2], 10);
  const mm = m[3] ? parseInt(m[3], 10) : 0;
  return sign * (h + mm / 60);
}

// Convert Sydney midnight on dateStr to a UTC Date instant
function sydneyDayBounds(dateStr: string): { start: Date; end: Date; date: Date; dow: number } {
  const utcMidnight = new Date(`${dateStr}T00:00:00Z`);
  const offset = sydneyOffsetHours(utcMidnight);
  const start = new Date(utcMidnight.getTime() - offset * 3600 * 1000);
  const end = new Date(start.getTime() + 24 * 3600 * 1000 - 1);
  // Day-of-week computed from Sydney's local date
  const [y, m, d] = dateStr.split("-").map(Number);
  // Use UTC date construction so getUTCDay reflects the Sydney calendar date
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  // The "date" we pass to ScheduleGrid is the Sydney midnight UTC instant
  return { start, end, date: start, dow };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ date?: string }>; }) {
  const session = (await auth())!;
  const sp = await searchParams;
  const dateStr = sp.date ?? todayInSydney();
  const { start: dayStart, end: dayEnd, date: day, dow } = sydneyDayBounds(dateStr);

  const [therapistsRaw, bookings] = await Promise.all([
    db.therapist.findMany({
      where: { active: true },
      include: { user: { select: { name: true } }, availability: { where: { dayOfWeek: dow } } },
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
    <StaffShell user={session.user} topbar={<DateNav date={day} basePath="/staff/schedule" />}>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Schedule</h1>
          <Button asChild>
            <Link href={`/book?date=${dateStr}`}>
              <Plus className="h-4 w-4 mr-1" /> New Booking
            </Link>
          </Button>
        </div>
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
