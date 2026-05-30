"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { sydneyTimeShort, SYDNEY_TZ } from "@/lib/time";
import { formatPrice } from "@/lib/utils";
import { TherapistQuickActions } from "@/components/therapist-quick-actions";
import { BookingQuickActions } from "@/app/(portal)/staff/schedule/quick-actions";

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 21; // exclusive
const HOUR_PX = 120;
const MIN_PX = HOUR_PX / 60;
const COL_MIN_W = 200;

type Booking = {
  id: string;
  reference: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  priceCentsAtBooking: number;
  service: { name: string; category: string };
  variant: { durationMin: number };
  client: { id: string; name: string; phone: string | null };
  therapistId: string | null;
  /** True if the client has no prior CONFIRMED/COMPLETED bookings — this is
   *  their first visit. Surfaced as a "NEW" badge on the card so therapists
   *  can prep differently. */
  isFirstVisit?: boolean;
};

type Therapist = {
  id: string;
  initials: string;
  name: string;
  isWorking: boolean;
  isActive?: boolean;
  startMin?: number;
  endMin?: number;
  timeOff?: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    reason: string | null;
  }[];
};

const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, i) => DAY_START_HOUR + i,
);

function paletteFor(category: string, status: string): string {
  if (status === "CANCELLED") return "5";
  if (status === "NO_SHOW") return "5";
  return (
    {
      THERAPEUTIC: "1",
      RELAXATION: "3",
      SPECIALTY: "4",
      ADD_ON: "2",
    } as Record<string, string>
  )[category] ?? "2";
}

function hourLabel(h: number): string {
  if (h === 0) return "12 am";
  if (h === 12) return "12 pm";
  return h < 12 ? `${h} am` : `${h - 12} pm`;
}

/**
 * Minutes since Sydney-local midnight for the given UTC instant.
 * Uses Intl to extract Sydney clock hours/minutes regardless of the
 * server timezone — Vercel runs UTC so a naive d.getHours() would
 * mis-position bookings by 10 or 11 hours.
 */
function minutesFromMidnight(d: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: SYDNEY_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

export function ScheduleGrid({
  date,
  therapists,
  bookings,
  dateStr,
  addTimeOffAction,
  toggleActiveAction,
  removeTimeOffAction,
}: {
  date: Date;
  therapists: Therapist[];
  bookings: Booking[];
  /** Sydney YYYY-MM-DD that this grid is showing. Required for quick-actions menu. */
  dateStr?: string;
  addTimeOffAction?: (
    fd: FormData,
  ) => Promise<{ ok?: boolean; error?: string }>;
  toggleActiveAction?: (
    fd: FormData,
  ) => Promise<{ ok?: boolean; error?: string }>;
  removeTimeOffAction?: (
    fd: FormData,
  ) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const dayStartMin = DAY_START_HOUR * 60;
  const dayEndMin = DAY_END_HOUR * 60;

  // Per-therapist day stats: how booked they are (utilisation %) and where the
  // open bookable gaps are. Computed once and shared by the header (badge) and
  // the body columns (gap markers). Cancelled/no-show bookings don't occupy
  // the chair, so they don't count toward "booked" or block a gap.
  type DayStats = { utilPct: number | null; gaps: [number, number][] };
  function computeDayStats(t: Therapist): DayStats | null {
    if (!t.isWorking || t.startMin == null || t.endMin == null) return null;
    const ws = t.startMin;
    const we = t.endMin;
    const intervals: [number, number][] = [];
    let bookedMin = 0;
    for (const b of bookings) {
      if (b.therapistId !== t.id) continue;
      if (b.status === "CANCELLED" || b.status === "NO_SHOW") continue;
      const s = minutesFromMidnight(b.startsAt);
      const e = s + b.variant.durationMin;
      const cs = Math.max(s, ws);
      const ce = Math.min(e, we);
      if (ce > cs) {
        intervals.push([cs, ce]);
        bookedMin += ce - cs;
      }
    }
    let offMin = 0;
    const dayStartUTC = date.getTime();
    const dayEndUTC = dayStartUTC + 24 * 3600 * 1000 - 1;
    for (const o of t.timeOff ?? []) {
      const startTs = Math.max(o.startsAt.getTime(), dayStartUTC);
      const endTs = Math.min(o.endsAt.getTime(), dayEndUTC);
      if (endTs <= startTs) continue;
      const sMin = minutesFromMidnight(new Date(startTs));
      const eMin = minutesFromMidnight(new Date(endTs));
      const cs = Math.max(sMin, ws);
      const ce = Math.min(eMin, we);
      if (ce > cs) {
        intervals.push([cs, ce]);
        offMin += ce - cs;
      }
    }
    const availMin = Math.max(0, we - ws - offMin);
    const utilPct =
      availMin > 0 ? Math.min(100, Math.round((bookedMin / availMin) * 100)) : null;
    // Free gaps = working window minus the union of occupied intervals.
    intervals.sort((a, b) => a[0] - b[0]);
    const gaps: [number, number][] = [];
    let cursor = ws;
    for (const [s, e] of intervals) {
      if (s > cursor) gaps.push([cursor, s]);
      cursor = Math.max(cursor, e);
    }
    if (cursor < we) gaps.push([cursor, we]);
    // Only surface gaps long enough to actually slot a booking into.
    return { utilPct, gaps: gaps.filter(([s, e]) => e - s >= 30) };
  }
  const dayStats = new Map(therapists.map((t) => [t.id, computeDayStats(t)]));

  function handleColumnClick(
    e: React.MouseEvent<HTMLDivElement>,
    t: Therapist,
  ) {
    if (!dateStr || !t.isWorking) return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, [role="menu"]')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y < 0) return;
    const minutes = dayStartMin + y / MIN_PX;
    // Skip clicks outside the therapist's working hours.
    if (t.startMin != null && minutes < t.startMin) return;
    if (t.endMin != null && minutes >= t.endMin) return;
    // Skip clicks that fall inside a time-off window.
    if (t.timeOff && t.timeOff.length) {
      const dayStartUTC = date.getTime();
      const dayEndUTC = dayStartUTC + 24 * 3600 * 1000 - 1;
      for (const tw of t.timeOff) {
        const ts = Math.max(tw.startsAt.getTime(), dayStartUTC);
        const te = Math.min(tw.endsAt.getTime(), dayEndUTC);
        if (te <= ts) continue;
        const sMin = minutesFromMidnight(new Date(ts));
        const eMin = minutesFromMidnight(new Date(te));
        if (minutes >= sMin && minutes < eMin) return;
      }
    }
    // Floor to the nearest 30-min slot so a click anywhere in 9:00–9:29
    // resolves to 9:00. Clamp to the visible 8 AM–9 PM range.
    const rounded = Math.max(
      dayStartMin,
      Math.min(dayEndMin - 30, Math.floor(minutes / 30) * 30),
    );
    const h = Math.floor(rounded / 60);
    const m = rounded % 60;
    const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    router.push(
      `/staff/bookings/new?date=${encodeURIComponent(dateStr)}&therapistId=${encodeURIComponent(t.id)}&time=${encodeURIComponent(timeStr)}`,
    );
  }

  return (
    <div className="border rounded-md bg-card overflow-hidden">
      <div className="overflow-x-auto overflow-y-hidden">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `64px repeat(${Math.max(therapists.length, 1)}, minmax(${COL_MIN_W}px, 1fr))`,
          }}
        >
          {/* Header row */}
          <div className="border-b border-r bg-muted/30 h-12" />
          {therapists.map((t) => {
            const util = dayStats.get(t.id)?.utilPct ?? null;
            const utilTone =
              util == null
                ? ""
                : util >= 75
                  ? "text-emerald-600 dark:text-emerald-400"
                  : util <= 40
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-muted-foreground";
            return (
            <div
              key={t.id}
              className="border-b border-r last:border-r-0 bg-muted/30 h-12 px-3 flex items-center gap-2"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                {t.initials}
              </span>
              <div className="text-sm flex-1 min-w-0">
                <div className="font-medium leading-none truncate">{t.name}</div>
                {t.isWorking && t.startMin != null && t.endMin != null ? (
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {minToLabel(t.startMin)} – {minToLabel(t.endMin)}
                    {util != null && (
                      <>
                        {" · "}
                        <span className={`font-medium ${utilTone}`}>
                          {util}% booked
                        </span>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Off
                  </div>
                )}
              </div>
              {dateStr && addTimeOffAction && toggleActiveAction && (
                <TherapistQuickActions
                  therapistId={t.id}
                  therapistName={t.name}
                  isActive={t.isActive ?? true}
                  dateStr={dateStr}
                  addTimeOffAction={addTimeOffAction}
                  toggleActiveAction={toggleActiveAction}
                />
              )}
            </div>
            );
          })}

          {/* Body: time gutter + per-therapist column */}
          <div
            className="border-r relative"
            style={{ height: `${(DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX}px` }}
          >
            {HOURS.map((h, i) => (
              <div
                key={h}
                className="absolute left-0 right-0 text-[11px] text-muted-foreground pr-2 text-right -translate-y-1/2"
                style={{ top: `${i * HOUR_PX}px` }}
              >
                {hourLabel(h)}
              </div>
            ))}
            {HOURS.slice(0, -1).map((h, i) => (
              <div
                key={`half-${h}`}
                className="absolute left-0 right-0 text-[9px] text-muted-foreground/60 pr-2 text-right -translate-y-1/2"
                style={{ top: `${(i + 0.5) * HOUR_PX}px` }}
              >
                :30
              </div>
            ))}
          </div>

          {therapists.map((t) => {
            const ts = bookings.filter((b) => b.therapistId === t.id);
            const gaps = dayStats.get(t.id)?.gaps ?? [];
            return (
              <div
                key={t.id}
                className={`relative border-r last:border-r-0 ${dateStr && t.isWorking ? "cursor-pointer" : ""}`}
                onClick={(e) => handleColumnClick(e, t)}
                style={{
                  height: `${(DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX}px`,
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, hsl(var(--grid)) 0 1px, transparent 1px " +
                    HOUR_PX / 2 +
                    "px)",
                }}
              >
                {/* Off-hours overlay */}
                {!t.isWorking && (
                  <div className="absolute inset-0 bg-slate-300/80 dark:bg-slate-700/60 pointer-events-none" />
                )}

                {/* Time off & breaks — rendered before bookings so a stale
                    booking overlapping the block remains visible above. */}
                {t.timeOff?.map((o) => {
                  const dayStartUTC = date.getTime();
                  const dayEndUTC = dayStartUTC + 24 * 3600 * 1000 - 1;
                  const startTs = Math.max(o.startsAt.getTime(), dayStartUTC);
                  const endTs = Math.min(o.endsAt.getTime(), dayEndUTC);
                  if (endTs <= startTs) return null;
                  const sMin = minutesFromMidnight(new Date(startTs));
                  const eMin = minutesFromMidnight(new Date(endTs));
                  const visStart = Math.max(sMin, dayStartMin);
                  const visEnd = Math.min(eMin, dayEndMin);
                  if (visEnd <= visStart) return null;
                  const top = (visStart - dayStartMin) * MIN_PX;
                  const height = (visEnd - visStart) * MIN_PX;
                  return (
                    <button
                      type="button"
                      key={o.id}
                      className={`absolute left-0 right-0 bg-muted-foreground/15 border-l-2 border-muted-foreground/30 text-left ${removeTimeOffAction ? "hover:bg-muted-foreground/25 cursor-pointer" : "pointer-events-none"}`}
                      style={{ top: `${top}px`, height: `${height}px` }}
                      title={removeTimeOffAction ? `${o.reason ?? "Time off / break"} — click to remove` : (o.reason ?? "Time off / break")}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!removeTimeOffAction) return;
                        if (!confirm(`Remove this block (${o.reason ?? "Time off"})?`)) return;
                        const fd = new FormData();
                        fd.set("id", o.id);
                        const res = await removeTimeOffAction(fd);
                        if (res?.error) {
                          alert(`Failed: ${res.error}`);
                        } else {
                          router.refresh();
                        }
                      }}
                    >
                      {height >= 18 && (
                        <div className="text-[10px] text-muted-foreground p-1.5 leading-tight italic truncate">
                          {o.reason ?? "Off"}
                        </div>
                      )}
                    </button>
                  );
                })}
                {t.isWorking &&
                  t.startMin != null &&
                  t.startMin > dayStartMin && (
                    <div
                      className="absolute left-0 right-0 bg-slate-300/80 dark:bg-slate-700/60 pointer-events-none"
                      style={{
                        top: 0,
                        height: `${(t.startMin - dayStartMin) * MIN_PX}px`,
                      }}
                    />
                  )}
                {t.isWorking &&
                  t.endMin != null &&
                  t.endMin < dayEndMin && (
                    <div
                      className="absolute left-0 right-0 bg-slate-300/80 dark:bg-slate-700/60 pointer-events-none"
                      style={{
                        top: `${(t.endMin - dayStartMin) * MIN_PX}px`,
                        bottom: 0,
                      }}
                    />
                  )}

                {/* Open bookable gaps — clicking opens the new-booking form
                    pre-filled with this therapist and the gap's start minute.
                    Only gaps >= 30 min are shown. Renders as a Link so the
                    gap's exact start time is in the URL, not derived from a
                    pixel Y-coordinate. */}
                {dateStr &&
                  gaps.map(([s, e]) => {
                    const top = (s - dayStartMin) * MIN_PX;
                    const mins = e - s;
                    const height = mins * MIN_PX;
                    const gapLabel =
                      mins >= 60
                        ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}`
                        : `${mins} min`;
                    const startH = Math.floor(s / 60);
                    const startM = s % 60;
                    const timeStr = `${String(startH).padStart(2, "0")}:${String(startM).padStart(2, "0")}`;
                    return (
                      <Link
                        key={`gap-${s}`}
                        href={`/staff/bookings/new?date=${encodeURIComponent(dateStr)}&therapistId=${encodeURIComponent(t.id)}&time=${encodeURIComponent(timeStr)}`}
                        className="absolute left-1 right-1 rounded-md border border-dashed border-emerald-500/40 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.12] hover:border-emerald-500/60 transition-colors flex items-center justify-center"
                        style={{ top: `${top}px`, height: `${height}px` }}
                        onClick={(ev) => ev.stopPropagation()}
                        title={`Book at ${minToLabel(s)} with ${t.name}`}
                      >
                        <span className="text-[10px] font-medium text-emerald-700/70 dark:text-emerald-400/70 uppercase tracking-wide">
                          Open · {gapLabel}
                        </span>
                      </Link>
                    );
                  })}

                {ts.map((b) => {
                  const startMin = minutesFromMidnight(b.startsAt);
                  const top = (startMin - dayStartMin) * MIN_PX;
                  const height = b.variant.durationMin * MIN_PX;
                  if (top + height < 0 || top > (dayEndMin - dayStartMin) * MIN_PX) return null;
                  const c = paletteFor(b.service.category, b.status);
                  const cancelled = b.status === "CANCELLED" || b.status === "NO_SHOW";
                  return (
                    <div
                      key={b.id}
                      className={`absolute left-1 right-1 ${cancelled ? "opacity-60" : ""}`}
                      style={{
                        top: `${top + 1}px`,
                        height: `${height - 2}px`,
                      }}
                    >
                      <Link
                        href={`/staff/bookings/${b.id}`}
                        className="absolute inset-0 rounded-md p-2 text-[11px] leading-tight overflow-hidden border-l-[6px] shadow-sm hover:shadow-md transition-shadow block"
                        style={{
                          background: `hsl(var(--bk-${c}-bg))`,
                          borderLeftColor: `hsl(var(--bk-${c}-border))`,
                          color: `hsl(var(--bk-${c}-text))`,
                        }}
                      >
                        <div className="font-semibold pr-7">
                          {sydneyTimeShort(b.startsAt)} – {sydneyTimeShort(b.endsAt)}
                        </div>
                        {b.client.phone && (
                          <div className="opacity-75 truncate">{b.client.phone}</div>
                        )}
                        <div className="font-medium truncate flex items-center gap-1">
                          {b.isFirstVisit && (
                            <span className="inline-block rounded-sm bg-emerald-500/90 text-white text-[9px] font-bold uppercase px-1 py-px tracking-wider shrink-0">
                              New
                            </span>
                          )}
                          <span className="truncate">{b.client.name}</span>
                        </div>
                        <div className="opacity-80 truncate">
                          {b.variant.durationMin} min {b.service.name}
                        </div>
                        <div className="font-semibold mt-0.5">
                          {formatPrice(b.priceCentsAtBooking)}
                        </div>
                      </Link>
                      <div
                        className="absolute top-1 right-1"
                        style={{ color: `hsl(var(--bk-${c}-text))` }}
                      >
                        <BookingQuickActions
                          bookingId={b.id}
                          clientId={b.client.id}
                          status={b.status}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function minToLabel(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = ((h + 11) % 12) + 1;
  return mm === 0 ? `${h12}:00 ${ampm}` : `${h12}:${mm.toString().padStart(2, "0")} ${ampm}`;
}
