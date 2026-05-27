import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffShell, DateNav } from "@/components/staff-shell";
import { ScheduleGrid } from "@/components/schedule-grid";
import { AutoRefresh } from "@/components/auto-refresh";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import {
  addTimeOff,
  toggleTherapistActive,
  removeTimeOffFromSchedule,
} from "@/app/(portal)/staff/therapists/[id]/actions";
import { BlockTimeDialog } from "./block-time-dialog";
import { WalkinFinderDialog } from "./walkin-finder-dialog";

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

  const [therapistsRaw, bookings, timeOffs] = await Promise.all([
    // Show ALL therapists on the schedule (active + inactive). Inactive ones
    // get isWorking=false so their column reads as fully off, but their
    // quick-action menu offers "Activate" so admins can re-enable them
    // without leaving the schedule page.
    db.therapist.findMany({
      include: { user: { select: { name: true } }, availability: { where: { dayOfWeek: dow } } },
      orderBy: [{ active: "desc" }, { user: { name: "asc" } }],
    }),
    db.booking.findMany({
      where: {
        startsAt: { gte: dayStart, lte: dayEnd },
        status: { in: ["PENDING", "CONFIRMED", "COMPLETED", "NO_SHOW"] },
      },
      include: {
        service: true,
        variant: true,
        client: { select: { id: true, name: true, phone: true } },
      },
      orderBy: { startsAt: "asc" },
    }),
    // Time-off windows that overlap the displayed day. Multi-day vacations
    // are clipped to the day inside the grid component.
    db.timeOff.findMany({
      where: {
        therapist: { active: true },
        startsAt: { lt: dayEnd },
        endsAt: { gt: dayStart },
      },
      select: {
        id: true,
        therapistId: true,
        startsAt: true,
        endsAt: true,
        reason: true,
      },
    }),
  ]);

  // First-visit detection: for every client booked today, count their prior
  // CONFIRMED/COMPLETED bookings. Zero prior → mark this as their first
  // visit so the schedule grid can render a "NEW" badge. Helps therapists
  // prep differently (intro chat, intake check) for new clients.
  const clientIds = [...new Set(bookings.map((b) => b.clientId))];
  const priorCounts = clientIds.length
    ? await db.booking.groupBy({
        by: ["clientId"],
        where: {
          clientId: { in: clientIds },
          startsAt: { lt: dayStart },
          status: { in: ["CONFIRMED", "COMPLETED"] },
        },
        _count: { _all: true },
      })
    : [];
  const priorMap = new Map(
    priorCounts.map((p) => [p.clientId, p._count._all]),
  );
  const bookingsWithBadge = bookings.map((b) => ({
    ...b,
    isFirstVisit: (priorMap.get(b.clientId) ?? 0) === 0,
  }));

  // Today's tally — what's actually happening today, at a glance. Counts
  // and dollars are computed off the same bookings list the grid is
  // rendering so they stay in sync.
  const tallyTotal = bookings.length;
  const tallyConfirmed = bookings.filter(
    (b) => b.status === "CONFIRMED" || b.status === "COMPLETED",
  ).length;
  const tallyNoShow = bookings.filter((b) => b.status === "NO_SHOW").length;
  const tallyCancelled = bookings.filter((b) => b.status === "CANCELLED").length;
  const tallyRevenueCents = bookings
    .filter((b) => b.status === "CONFIRMED" || b.status === "COMPLETED")
    .reduce((s, b) => s + b.priceCentsAtBooking, 0);

  const therapists = therapistsRaw.map((t) => {
    const slot = t.availability[0];
    const ts = timeOffs.filter((o) => o.therapistId === t.id);
    return {
      id: t.id,
      name: t.user.name,
      initials: initials(t.user.name),
      // Inactive therapists are always rendered as off, even if they have a
      // weekly-availability record for this day-of-week.
      isWorking: t.active && !!slot,
      isActive: t.active,
      startMin: slot?.startMin,
      endMin: slot?.endMin,
      timeOff: ts.map((o) => ({
        id: o.id,
        startsAt: o.startsAt,
        endsAt: o.endsAt,
        reason: o.reason,
      })),
    };
  });

  return (
    <StaffShell user={session.user} topbar={<DateNav date={day} basePath="/staff/schedule" />}>
      <AutoRefresh intervalMs={30000} />
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">Schedule</h1>
          <div className="flex items-center gap-2">
            {therapists.length > 0 && <WalkinFinderDialog />}
            {session.user.role === "ADMIN" && therapists.length > 0 && (
              <BlockTimeDialog
                therapists={therapists.map((t) => ({
                  id: t.id,
                  name: t.name,
                  isActive: t.isActive ?? true,
                }))}
                dateStr={dateStr}
                addTimeOffAction={addTimeOff}
              />
            )}
            <Button asChild>
              <Link href={`/staff/bookings/new?date=${dateStr}`}>
                <Plus className="h-4 w-4 mr-1" /> New Booking
              </Link>
            </Button>
          </div>
        </div>

        {/* Today's tally — at-a-glance counts + revenue for the shown day. */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
          <TallyCard label="Bookings" value={`${tallyConfirmed}/${tallyTotal}`} hint="confirmed / total" />
          <TallyCard label="Revenue" value={formatPrice(tallyRevenueCents)} hint="confirmed only" />
          <TallyCard
            label="No-shows"
            value={tallyNoShow.toString()}
            hint={tallyNoShow > 0 ? "follow up" : "all good"}
            tone={tallyNoShow > 0 ? "warning" : "muted"}
          />
          <TallyCard
            label="Cancelled"
            value={tallyCancelled.toString()}
            hint="for the day"
            tone="muted"
          />
        </div>
        {therapists.length === 0 ? (
          <div className="rounded-md border bg-card p-8 text-sm text-muted-foreground text-center">
            No active therapists. Add one in Therapists.
          </div>
        ) : (
          <ScheduleGrid
            date={day}
            dateStr={dateStr}
            therapists={therapists}
            bookings={bookingsWithBadge}
            // Quick-actions menu (add break, toggle active) and the
            // click-to-remove-time-off behaviour are admin-only — non-admin
            // STAFF still see the schedule, just without the mutation UI.
            // The actions themselves also re-check role server-side.
            {...(session.user.role === "ADMIN"
              ? {
                  addTimeOffAction: addTimeOff,
                  toggleActiveAction: toggleTherapistActive,
                  removeTimeOffAction: removeTimeOffFromSchedule,
                }
              : {})}
          />
        )}
      </div>
    </StaffShell>
  );
}

function TallyCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "warning" | "muted";
}) {
  const toneClasses =
    tone === "warning"
      ? "border-amber-500/40 bg-amber-500/5"
      : tone === "muted"
        ? "bg-muted/30"
        : "bg-card";
  return (
    <div className={`rounded-md border px-3 py-2 ${toneClasses}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="font-semibold tabular-nums">{value}</div>
      {hint && (
        <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>
      )}
    </div>
  );
}
