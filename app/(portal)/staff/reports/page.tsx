import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatPrice, therapistInternalName } from "@/lib/utils";
import { Download, Filter, TrendingUp, TrendingDown, Minus } from "lucide-react";
import {
  format,
  subDays,
  startOfWeek,
  subWeeks,
  addWeeks,
  endOfWeek,
} from "date-fns";
import type { Prisma } from "@prisma/client";

// Sydney calendar time for booking.startsAt (UTC in DB; Vercel runs in UTC).
// date-fns format() is still fine for the date-input defaults and filter chip
// because those operate on user-provided local-day Date objects.
const SYD_DATE = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const SYD_TIME = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export const metadata = { title: "Reports" };

type SP = {
  from?: string;
  to?: string;
  therapist?: string;
  service?: string;
  fund?: string;
  status?: string;
  claim?: string; // "yes" | "no" | ""
};

function parseDate(s?: string, fallback?: Date): Date {
  if (!s) return fallback ?? new Date();
  const d = new Date(s);
  return isNaN(d.getTime()) ? (fallback ?? new Date()) : d;
}

function buildWhere(sp: SP, fromDate: Date, toDate: Date): Prisma.BookingWhereInput {
  return {
    startsAt: { gte: fromDate, lte: toDate },
    ...(sp.therapist ? { therapistId: sp.therapist } : {}),
    ...(sp.service ? { serviceId: sp.service } : {}),
    ...(sp.status ? { status: sp.status } : {}),
    ...(sp.claim === "yes"
      ? { claimWithHealthFund: true }
      : sp.claim === "no"
        ? { claimWithHealthFund: false }
        : {}),
    // Health fund filter requires a join via the client's intake; we filter
    // post-fetch since IntakeForm is a separate table not directly relatable
    // to a single Booking.
  };
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = (await auth())!;
  const sp = await searchParams;

  // Defaults: last 30 days
  const today = new Date();
  const defaultFrom = subDays(today, 30);
  defaultFrom.setHours(0, 0, 0, 0);
  const defaultTo = new Date(today);
  defaultTo.setHours(23, 59, 59, 999);

  const fromDate = parseDate(sp.from, defaultFrom);
  fromDate.setHours(0, 0, 0, 0);
  const toDate = parseDate(sp.to, defaultTo);
  toDate.setHours(23, 59, 59, 999);

  const where = buildWhere(sp, fromDate, toDate);

  // --- 8-week revenue trend (independent of the filter date range) ---
  // Always shows the last 8 ISO weeks ending with the current week so the
  // owner has a quick "are we trending up?" read regardless of what date
  // range the table below is filtered to.
  const WEEK_COUNT = 8;
  const trendStart = startOfWeek(subWeeks(new Date(), WEEK_COUNT - 1), {
    weekStartsOn: 1,
  });
  const trendEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  const trendBookings = await db.booking.findMany({
    where: {
      startsAt: { gte: trendStart, lte: trendEnd },
      status: { in: ["CONFIRMED", "COMPLETED"] },
    },
    select: { startsAt: true, priceCentsAtBooking: true },
  });
  const weeks: { start: Date; revenueCents: number; count: number }[] = [];
  for (let i = 0; i < WEEK_COUNT; i++) {
    weeks.push({
      start: addWeeks(trendStart, i),
      revenueCents: 0,
      count: 0,
    });
  }
  for (const b of trendBookings) {
    const idx = Math.floor(
      (b.startsAt.getTime() - trendStart.getTime()) /
        (7 * 24 * 60 * 60 * 1000),
    );
    if (idx >= 0 && idx < WEEK_COUNT) {
      weeks[idx].revenueCents += b.priceCentsAtBooking;
      weeks[idx].count += 1;
    }
  }
  const maxWeekRevenue = Math.max(1, ...weeks.map((w) => w.revenueCents));
  const thisWeekRevenue = weeks[WEEK_COUNT - 1].revenueCents;
  const lastWeekRevenue = weeks[WEEK_COUNT - 2].revenueCents;
  const wowDeltaPct =
    lastWeekRevenue === 0
      ? null
      : ((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100;

  const [bookingsRaw, allTherapists, allServices, fundOptions] =
    await Promise.all([
      db.booking.findMany({
        where,
        include: {
          service: { select: { id: true, name: true } },
          variant: { select: { durationMin: true } },
          client: { select: { id: true, name: true, email: true } },
          therapist: { include: { user: { select: { name: true } } } },
        },
        orderBy: { startsAt: "desc" },
      }),
      db.therapist.findMany({
        include: { user: { select: { name: true } } },
        orderBy: { user: { name: "asc" } },
      }),
      db.service.findMany({
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      // Distinct fund names ever recorded
      db.intakeForm
        .findMany({
          where: { healthFundName: { not: null } },
          select: { healthFundName: true },
          distinct: ["healthFundName"],
        })
        .then((rows) =>
          rows.map((r) => r.healthFundName).filter((s): s is string => !!s),
        ),
    ]);

  // For each booking, fetch the latest intake on or before the booking date
  // to get the fund name at time of booking. (Intake snapshots are per-user
  // not per-booking; we approximate by latest intake at booking time.)
  const bookingIds = bookingsRaw.map((b) => b.id);
  const userIds = [...new Set(bookingsRaw.map((b) => b.clientId))];
  const intakes = await db.intakeForm.findMany({
    where: { userId: { in: userIds } },
    orderBy: { createdAt: "desc" },
  });
  function fundForBooking(clientId: string, when: Date): string | null {
    const candidate = intakes.find(
      (i) => i.userId === clientId && i.createdAt <= when,
    );
    return candidate?.healthFundName ?? null;
  }

  // Enrich + post-filter by fund
  const enriched = bookingsRaw.map((b) => ({
    ...b,
    fund: b.claimWithHealthFund
      ? fundForBooking(b.clientId, b.startsAt)
      : null,
  }));
  const bookings = sp.fund
    ? enriched.filter((b) => b.fund === sp.fund)
    : enriched;

  // --- Summary stats ---
  const totalCount = bookings.length;
  const completedOrConfirmed = bookings.filter(
    (b) => b.status === "CONFIRMED" || b.status === "COMPLETED",
  );
  const totalRevenueCents = completedOrConfirmed.reduce(
    (s, b) => s + b.priceCentsAtBooking,
    0,
  );
  const cancelled = bookings.filter((b) => b.status === "CANCELLED").length;
  const noShow = bookings.filter((b) => b.status === "NO_SHOW").length;
  const uniqueClients = new Set(bookings.map((b) => b.clientId)).size;
  const fundClaimCount = bookings.filter((b) => b.claimWithHealthFund).length;
  const fundClaimRevenue = bookings
    .filter(
      (b) =>
        b.claimWithHealthFund &&
        (b.status === "CONFIRMED" || b.status === "COMPLETED"),
    )
    .reduce((s, b) => s + b.priceCentsAtBooking, 0);

  // --- Breakdowns ---
  type Row = { key: string; label: string; count: number; revenueCents: number; minutes: number };
  function group(by: (b: (typeof bookings)[number]) => { key: string; label: string } | null): Row[] {
    const map = new Map<string, Row>();
    for (const b of bookings) {
      const k = by(b);
      if (!k) continue;
      const r = map.get(k.key) ?? { ...k, count: 0, revenueCents: 0, minutes: 0 };
      r.count += 1;
      if (b.status === "CONFIRMED" || b.status === "COMPLETED") {
        r.revenueCents += b.priceCentsAtBooking;
        r.minutes += b.variant.durationMin;
      }
      map.set(k.key, r);
    }
    return [...map.values()].sort((a, b) => b.revenueCents - a.revenueCents);
  }

  const byFund = group((b) =>
    b.fund ? { key: b.fund, label: b.fund } : { key: "_none", label: "No claim" },
  );
  const byStaff = group((b) =>
    b.therapistId
      ? { key: b.therapistId, label: b.therapist ? therapistInternalName(b.therapist) : "Unknown" }
      : { key: "_none", label: "Unassigned" },
  );
  const byService = group((b) => ({ key: b.serviceId, label: b.service.name }));

  // Build filter URL preserving other params
  function buildSelectName(name: keyof SP) {
    return name as string;
  }

  const csvUrl = `/api/staff/reports/csv?${new URLSearchParams(
    Object.entries({
      from: format(fromDate, "yyyy-MM-dd"),
      to: format(toDate, "yyyy-MM-dd"),
      therapist: sp.therapist ?? "",
      service: sp.service ?? "",
      fund: sp.fund ?? "",
      status: sp.status ?? "",
      claim: sp.claim ?? "",
    }).filter(([, v]) => v),
  ).toString()}`;

  const STATUSES = ["", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW", "PENDING"];

  return (
    <StaffShell
      user={session.user}
      topbar={<span className="text-foreground font-medium">Reports</span>}
    >
      <div className="p-4 space-y-4">
        {/* 8-week trend — always shows the last 8 weeks regardless of the
            date filter below. Quick "are we up or down?" read. */}
        <Card>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-baseline justify-between flex-wrap gap-2">
              <div>
                <div className="font-semibold">Last 8 weeks revenue</div>
                <div className="text-xs text-muted-foreground">
                  Independent of the filters below. Confirmed + completed only.
                </div>
              </div>
              <WowDelta
                thisWeek={thisWeekRevenue}
                lastWeek={lastWeekRevenue}
                deltaPct={wowDeltaPct}
              />
            </div>
            <div className="flex items-end gap-1 h-32 pt-2">
              {weeks.map((w, i) => {
                const h = (w.revenueCents / maxWeekRevenue) * 100;
                const isCurrent = i === WEEK_COUNT - 1;
                return (
                  <div
                    key={w.start.toISOString()}
                    className="flex-1 flex flex-col items-center justify-end gap-1 min-w-0"
                    title={`${format(w.start, "d MMM")}: ${formatPrice(
                      w.revenueCents,
                    )} (${w.count} bookings)`}
                  >
                    <div className="text-[10px] tabular-nums text-muted-foreground">
                      {w.revenueCents > 0
                        ? `$${Math.round(w.revenueCents / 100)}`
                        : ""}
                    </div>
                    <div
                      className={`w-full rounded-t-sm transition-all ${
                        isCurrent ? "bg-primary" : "bg-primary/40"
                      }`}
                      style={{ height: `${Math.max(h, 2)}%` }}
                    />
                    <div className="text-[10px] text-muted-foreground tabular-nums">
                      {format(w.start, "d MMM")}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-end">
              <div className="space-y-1.5">
                <Label htmlFor="from" className="text-xs">From</Label>
                <Input
                  id="from"
                  name="from"
                  type="date"
                  defaultValue={format(fromDate, "yyyy-MM-dd")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="to" className="text-xs">To</Label>
                <Input
                  id="to"
                  name="to"
                  type="date"
                  defaultValue={format(toDate, "yyyy-MM-dd")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="therapist" className="text-xs">Therapist</Label>
                <select
                  id="therapist"
                  name="therapist"
                  defaultValue={sp.therapist ?? ""}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">All therapists</option>
                  {allTherapists.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.user.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="service" className="text-xs">Service</Label>
                <select
                  id="service"
                  name="service"
                  defaultValue={sp.service ?? ""}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">All services</option>
                  {allServices.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fund" className="text-xs">Health fund</Label>
                <select
                  id="fund"
                  name="fund"
                  defaultValue={sp.fund ?? ""}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">All funds</option>
                  {fundOptions.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="claim" className="text-xs">Claim?</Label>
                <select
                  id="claim"
                  name="claim"
                  defaultValue={sp.claim ?? ""}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Any</option>
                  <option value="yes">Health fund claim only</option>
                  <option value="no">Non-claim only</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="status" className="text-xs">Status</Label>
                <select
                  id="status"
                  name="status"
                  defaultValue={sp.status ?? ""}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s || "All statuses"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 lg:justify-end">
                <Button type="submit">
                  <Filter className="h-4 w-4" /> Apply
                </Button>
                <Button asChild variant="outline">
                  <a href="/staff/reports">Reset</a>
                </Button>
                {session.user.role === "ADMIN" && (
                  <Button asChild variant="outline">
                    <a href={csvUrl} download>
                      <Download className="h-4 w-4" /> CSV
                    </a>
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Bookings" value={totalCount.toString()} />
          <Stat label="Revenue" value={formatPrice(totalRevenueCents)} />
          <Stat label="Unique clients" value={uniqueClients.toString()} />
          <Stat
            label="Cancellations / No-shows"
            value={`${cancelled} / ${noShow}`}
          />
          <Stat
            label="Health fund claims"
            value={`${fundClaimCount} (${formatPrice(fundClaimRevenue)})`}
          />
          <Stat
            label="Range"
            value={`${format(fromDate, "d MMM")} – ${format(toDate, "d MMM yyyy")}`}
          />
        </div>

        {/* Breakdowns */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Breakdown title="By health fund" rows={byFund} />
          <Breakdown title="By therapist" rows={byStaff} />
          <Breakdown title="By service" rows={byService} />
        </div>

        {/* Detail table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
                  <tr className="text-left">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Ref</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Therapist</th>
                    <th className="px-4 py-3">Fund</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.slice(0, 200).map((b) => (
                    <tr key={b.id} className="border-t">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {SYD_DATE.format(b.startsAt)}
                        <div className="text-xs text-muted-foreground">
                          {SYD_TIME.format(b.startsAt)}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{b.reference}</td>
                      <td className="px-4 py-3">{b.client.name}</td>
                      <td className="px-4 py-3">
                        {b.service.name}
                        <div className="text-xs text-muted-foreground">
                          {b.variant.durationMin} min
                        </div>
                      </td>
                      <td className="px-4 py-3">{b.therapist ? therapistInternalName(b.therapist) : "—"}</td>
                      <td className="px-4 py-3">
                        {b.claimWithHealthFund ? (
                          <Badge variant="success">{b.fund ?? "Yes"}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            b.status === "CONFIRMED" || b.status === "COMPLETED"
                              ? "success"
                              : b.status === "CANCELLED"
                                ? "destructive"
                                : b.status === "NO_SHOW"
                                  ? "warning"
                                  : "secondary"
                          }
                        >
                          {b.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatPrice(b.priceCentsAtBooking)}
                      </td>
                    </tr>
                  ))}
                  {bookings.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-10 text-center text-muted-foreground"
                      >
                        No bookings match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {bookings.length > 200 && (
              <div className="p-3 text-xs text-muted-foreground border-t text-center">
                Showing first 200 of {bookings.length}. Export CSV for full data.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </StaffShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-xl font-semibold mt-1 tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; count: number; revenueCents: number; minutes: number }[];
}) {
  const maxRevenue = Math.max(1, ...rows.map((r) => r.revenueCents));
  return (
    <Card>
      <CardContent className="py-4 space-y-3">
        <div className="font-semibold">{title}</div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.key} className="space-y-0.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{r.label}</span>
                  <span className="tabular-nums font-medium">
                    {formatPrice(r.revenueCents)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                  <span>{r.count} bookings</span>
                  <span>{Math.round(r.minutes / 60)} hr</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${(r.revenueCents / maxRevenue) * 100}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function WowDelta({
  thisWeek,
  lastWeek,
  deltaPct,
}: {
  thisWeek: number;
  lastWeek: number;
  deltaPct: number | null;
}) {
  // "deltaPct null" = last week was zero, so percentage is meaningless.
  // Show a different hint in that case so we don't render "Infinity %".
  if (deltaPct === null) {
    return (
      <div className="text-xs text-muted-foreground">
        This wk {formatPrice(thisWeek)} · last wk {formatPrice(lastWeek)}
      </div>
    );
  }
  const sign = deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat";
  const Icon =
    sign === "up" ? TrendingUp : sign === "down" ? TrendingDown : Minus;
  const colorCls =
    sign === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : sign === "down"
        ? "text-destructive"
        : "text-muted-foreground";
  return (
    <div className={`flex items-center gap-1.5 text-sm font-medium ${colorCls}`}>
      <Icon className="h-4 w-4" />
      <span className="tabular-nums">
        {deltaPct > 0 ? "+" : ""}
        {deltaPct.toFixed(1)}%
      </span>
      <span className="text-muted-foreground font-normal">vs last week</span>
    </div>
  );
}
