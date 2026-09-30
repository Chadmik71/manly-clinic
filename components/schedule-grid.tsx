"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sydneyTimeShort, SYDNEY_TZ } from "@/lib/time";
import { formatPrice } from "@/lib/utils";
import { TherapistQuickActions } from "@/components/therapist-quick-actions";
import { BookingQuickActions } from "@/app/(portal)/staff/schedule/quick-actions";
import {
  BookingDetailsDialog,
  type BookingPreview,
} from "@/app/(portal)/staff/schedule/booking-details-dialog";
import { MoveBookingDialog } from "@/app/(portal)/staff/schedule/move-booking-dialog";
import {
  QuickBookDialog,
  type QuickBookInitial,
  type QuickBookService,
} from "@/app/(portal)/staff/schedule/quick-book-dialog";
import { updateBookingDetails } from "@/app/(portal)/staff/bookings/[id]/actions";

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 21; // exclusive
// Tall hour rows so booking cards have room for legible details (time, name,
// phone, service, price). MIN_PX is derived, so every position/height in the
// grid rescales consistently when this changes.
const HOUR_PX = 150;
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
  variant: { id: string; durationMin: number };
  client: { id: string; name: string; phone: string | null };
  therapistId: string | null;
  /** True if the client has no prior CONFIRMED/COMPLETED bookings — this is
   *  their first visit. Surfaced as a "NEW" badge on the card so therapists
   *  can prep differently. */
  isFirstVisit?: boolean;
  /** Remedial/pregnancy booking still waiting on the full medical form
   *  (e.g. booked over the phone). Shown as a "Form needed" badge. */
  needsIntakeForm?: boolean;
  serviceId?: string;
  claimWithHealthFund?: boolean;
  arrivedAt?: Date | null;
  checkoutMethod?: string | null;
  /** Medical-form sections the client changed since their last visit
   *  (e.g. "Medications"). Non-empty shows a "Health update" badge. */
  healthChanges?: string[];
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
  services,
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
  /** Active services with lengths. Enables the quick-booking panel and
   *  stretching a booking to another length. */
  services?: QuickBookService[];
}) {
  const router = useRouter();
  const [quickBook, setQuickBook] = useState<QuickBookInitial | null>(null);
  const [booked, setBooked] = useState<{ reference: string; date: string } | null>(null);
  const [openBooking, setOpenBooking] = useState<BookingPreview | null>(null);
  const dayStartMin = DAY_START_HOUR * 60;
  const dayEndMin = DAY_END_HOUR * 60;

  // ---- Drag a booking card to another staff column / time ----------------
  // Mouse: press and move. Touch/pen: press and hold ~0.45 s, then move (a
  // quick swipe still scrolls). Drop opens a confirmation; the move itself
  // goes through updateBookingDetails, the same checks as "Edit appointment".
  type DragTarget = { therapistId: string; startMin: number };
  type DragState = {
    booking: Booking;
    fromTherapistId: string;
    pointerId: number;
    pointerType: string;
    startX: number;
    startY: number;
    grabOffsetY: number;
    active: boolean;
    target: DragTarget | null;
  };
  const dragRef = useRef<DragState | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const longPress = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const [pendingMove, setPendingMove] = useState<{ booking: Booking; fromTherapistId: string; target: DragTarget } | null>(null);
  const therapistName = (id: string | null) => therapists.find((t) => t.id === id)?.name ?? "Unassigned";

  const canDrag = (b: Booking) => !!dateStr && (b.status === "PENDING" || b.status === "CONFIRMED");

  function dropTargetAt(clientX: number, clientY: number, d: DragState): DragTarget | null {
    const col = document
      .elementsFromPoint(clientX, clientY)
      .find((el) => (el as HTMLElement).dataset?.therapistCol) as HTMLElement | undefined;
    if (!col) return null;
    const rect = col.getBoundingClientRect();
    const raw = dayStartMin + (clientY - d.grabOffsetY - rect.top) / MIN_PX;
    const snapped = Math.round(raw / 15) * 15;
    const latest = dayEndMin - d.booking.variant.durationMin;
    return {
      therapistId: col.dataset.therapistCol!,
      startMin: Math.max(dayStartMin, Math.min(latest, snapped)),
    };
  }

  function clearLongPress() {
    if (longPress.current != null) {
      window.clearTimeout(longPress.current);
      longPress.current = null;
    }
  }

  function activateDrag(el: HTMLElement) {
    const d = dragRef.current;
    if (!d) return;
    d.active = true;
    try {
      el.setPointerCapture(d.pointerId);
    } catch {
      // pointer already released
    }
    // A short buzz tells a phone user the booking has been picked up.
    if (d.pointerType !== "mouse") navigator.vibrate?.(25);
    lastPointer.current = { x: d.startX, y: d.startY };
    setDrag({ ...d });
  }

  function onCardPointerDown(e: React.PointerEvent<HTMLElement>, b: Booking, fromTherapistId: string) {
    if (e.button !== 0 || !canDrag(b)) return;
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    dragRef.current = {
      booking: b,
      fromTherapistId,
      pointerId: e.pointerId,
      pointerType: e.pointerType,
      startX: e.clientX,
      startY: e.clientY,
      grabOffsetY: e.clientY - rect.top,
      active: false,
      target: null,
    };
    if (e.pointerType !== "mouse") {
      clearLongPress();
      longPress.current = window.setTimeout(() => activateDrag(card), 450);
    }
  }

  function onCardPointerMove(e: React.PointerEvent<HTMLElement>) {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.active) {
      const dist = Math.hypot(e.clientX - d.startX, e.clientY - d.startY);
      if (d.pointerType === "mouse") {
        if (dist > 6) activateDrag(e.currentTarget);
        else return;
      } else {
        // Finger moved before the long-press: it's a scroll, not a drag.
        if (dist > 10) {
          clearLongPress();
          dragRef.current = null;
        }
        return;
      }
    }
    e.preventDefault();
    lastPointer.current = { x: e.clientX, y: e.clientY };
    d.target = dropTargetAt(e.clientX, e.clientY, d);
    setDrag({ ...d });
  }

  // While dragging, scroll when the pointer nears an edge, so a phone (which
  // shows only one or two staff columns) can reach the others and other times.
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragActive = !!drag?.active;
  useEffect(() => {
    if (!dragActive) return;
    const EDGE = 48;
    const STEP = 14;
    const id = window.setInterval(() => {
      const d = dragRef.current;
      const pt = lastPointer.current;
      const sc = scrollRef.current;
      if (!d?.active || !pt || !sc) return;
      const r = sc.getBoundingClientRect();
      let dx = 0;
      if (pt.x < r.left + EDGE + 64) dx = -STEP; // 64px time gutter on the left
      else if (pt.x > r.right - EDGE) dx = STEP;
      let dy = 0;
      if (pt.y < EDGE) dy = -STEP;
      else if (pt.y > window.innerHeight - EDGE) dy = STEP;
      const beforeX = sc.scrollLeft;
      const beforeY = window.scrollY;
      if (dx) sc.scrollLeft += dx;
      if (dy) window.scrollBy(0, dy);
      if (sc.scrollLeft !== beforeX || window.scrollY !== beforeY) {
        d.target = dropTargetAt(pt.x, pt.y, d);
        setDrag({ ...d });
      }
    }, 30);
    return () => window.clearInterval(id);
    // dropTargetAt only reads layout and props that don't change mid-drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragActive]);

  function endDrag(e: React.PointerEvent<HTMLElement>, cancelled: boolean) {
    clearLongPress();
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || e.pointerId !== d.pointerId) return;
    setDrag(null);
    if (!d.active) return;
    // A drag must not also count as a click that opens the pop-up.
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 50);
    if (cancelled || !d.target) return;
    const origStart = minutesFromMidnight(d.booking.startsAt);
    if (d.target.therapistId === d.fromTherapistId && d.target.startMin === origStart) return;
    setPendingMove({ booking: d.booking, fromTherapistId: d.fromTherapistId, target: d.target });
  }

  // While a touch drag is active, stop the page from scrolling under it.
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const onTouchMove = (ev: TouchEvent) => {
      if (dragRef.current?.active) ev.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, []);

  // The server refuses clashes and blocked-off time, but not a time outside
  // the staff member's shift (staff may be covering), so flag it here.
  function shiftWarning(target: DragTarget, durationMin: number): string | null {
    const t = therapists.find((x) => x.id === target.therapistId);
    if (!t) return null;
    const end = target.startMin + durationMin;
    if (!t.isWorking) return `${t.name} isn't rostered on this day.`;
    if ((t.startMin != null && target.startMin < t.startMin) || (t.endMin != null && end > t.endMin)) {
      return `This is outside ${t.name}'s working hours.`;
    }
    return null;
  }

  async function confirmMove(): Promise<{ error?: string }> {
    if (!pendingMove || !dateStr) return { error: "Nothing to move." };
    const { booking, target } = pendingMove;
    const hh = String(Math.floor(target.startMin / 60)).padStart(2, "0");
    const mm = String(target.startMin % 60).padStart(2, "0");
    const res = await updateBookingDetails(booking.id, {
      startsAt: `${dateStr}T${hh}:${mm}`,
      therapistId: target.therapistId,
      variantId: booking.variant.id,
    });
    if (res.error) return { error: res.error };
    setPendingMove(null);
    router.refresh();
    return {};
  }

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
    if (!dateStr || !t.isWorking || suppressClick.current) return;
    const target = e.target as HTMLElement;
    if (target.closest('a, button, [role="menu"], [role="separator"]')) return;
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
    if (services && services.length > 0) {
      setQuickBook({ date: dateStr, time: timeStr, therapistId: t.id });
      return;
    }
    router.push(
      `/staff/bookings/new?date=${encodeURIComponent(dateStr)}&therapistId=${encodeURIComponent(t.id)}&time=${encodeURIComponent(timeStr)}`,
    );
  }

  // ---- Stretch a booking (drag its bottom edge) to another length --------
  // Snaps to the lengths that service actually offers (e.g. 30/45/60/90).
  type ResizeState = { booking: Booking; pointerId: number; startY: number; variantId: string; durationMin: number };
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [pendingResize, setPendingResize] = useState<{ booking: Booking; variant: { id: string; durationMin: number; priceCents: number } } | null>(null);
  const variantsFor = (b: Booking) =>
    services?.find((sv) => sv.id === b.serviceId)?.variants.slice().sort((x, y) => x.durationMin - y.durationMin) ?? [];

  function onResizeDown(e: React.PointerEvent<HTMLElement>, b: Booking) {
    if (e.button !== 0 || !canDrag(b) || variantsFor(b).length < 2) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    setResize({ booking: b, pointerId: e.pointerId, startY: e.clientY, variantId: b.variant.id, durationMin: b.variant.durationMin });
  }

  function onResizeMove(e: React.PointerEvent<HTMLElement>) {
    if (!resize || e.pointerId !== resize.pointerId) return;
    e.preventDefault();
    const wanted = resize.booking.variant.durationMin + (e.clientY - resize.startY) / MIN_PX;
    const options = variantsFor(resize.booking);
    const best = options.reduce((a, v) => (Math.abs(v.durationMin - wanted) < Math.abs(a.durationMin - wanted) ? v : a), options[0]);
    if (best && best.id !== resize.variantId) setResize({ ...resize, variantId: best.id, durationMin: best.durationMin });
  }

  function onResizeUp(e: React.PointerEvent<HTMLElement>) {
    if (!resize || e.pointerId !== resize.pointerId) return;
    const r = resize;
    setResize(null);
    suppressClick.current = true;
    window.setTimeout(() => (suppressClick.current = false), 50);
    if (r.variantId === r.booking.variant.id) return;
    const v = variantsFor(r.booking).find((x) => x.id === r.variantId);
    if (v) setPendingResize({ booking: r.booking, variant: v });
  }

  async function confirmResize(): Promise<{ error?: string }> {
    if (!pendingResize || !dateStr) return { error: "Nothing to change." };
    const { booking, variant } = pendingResize;
    const startMin = minutesFromMidnight(booking.startsAt);
    const hh = String(Math.floor(startMin / 60)).padStart(2, "0");
    const mm = String(startMin % 60).padStart(2, "0");
    const res = await updateBookingDetails(booking.id, {
      startsAt: `${dateStr}T${hh}:${mm}`,
      therapistId: booking.therapistId ?? "",
      variantId: variant.id,
    });
    if (res.error) return { error: res.error };
    setPendingResize(null);
    router.refresh();
    return {};
  }

  return (
    <div
      ref={gridRef}
      className={`border rounded-md bg-card overflow-hidden ${drag?.active ? "cursor-grabbing select-none" : ""}`}
    >
      <div ref={scrollRef} className="overflow-x-auto overflow-y-hidden">
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
                data-therapist-col={t.id}
                className={`relative border-r last:border-r-0 ${dateStr && t.isWorking ? "cursor-pointer" : ""} ${drag?.active && drag.target?.therapistId === t.id ? "bg-primary/5" : ""}`}
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

                {/* Open bookable gaps. Each gap is one visual block ("Open ·
                    Xh Ym") with a stack of invisible 30-min Link cells inside
                    — so hovering a cell highlights just that strip and the
                    tooltip + URL reflect the cell's exact start time. A long
                    open day (e.g. no bookings at all) would otherwise render
                    as a single Link pegged to the gap's start, which silently
                    booked everything at 9 am. Only gaps >= 30 min are shown. */}
                {dateStr &&
                  gaps.map(([s, e]) => {
                    const top = (s - dayStartMin) * MIN_PX;
                    const mins = e - s;
                    const height = mins * MIN_PX;
                    const gapLabel =
                      mins >= 60
                        ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}`
                        : `${mins} min`;
                    // 30-min cells covering [s, e). Truncate any trailing
                    // partial cell so we don't offer a 15-min stub.
                    const cells: number[] = [];
                    for (let c = s; c + 30 <= e; c += 30) cells.push(c);
                    return (
                      <div
                        key={`gap-${s}`}
                        className="absolute left-1 right-1 rounded-md border border-dashed border-emerald-500/40 bg-emerald-500/[0.06] flex items-center justify-center"
                        style={{ top: `${top}px`, height: `${height}px` }}
                        onClick={(ev) => ev.stopPropagation()}
                      >
                        <span className="text-[10px] font-medium text-emerald-700/70 dark:text-emerald-400/70 uppercase tracking-wide pointer-events-none select-none">
                          Open · {gapLabel}
                        </span>
                        {cells.map((cellMin) => {
                          const cellH = Math.floor(cellMin / 60);
                          const cellM = cellMin % 60;
                          const timeStr = `${String(cellH).padStart(2, "0")}:${String(cellM).padStart(2, "0")}`;
                          return (
                            <Link
                              key={cellMin}
                              href={`/staff/bookings/new?date=${encodeURIComponent(dateStr)}&therapistId=${encodeURIComponent(t.id)}&time=${encodeURIComponent(timeStr)}`}
                              className="absolute left-0 right-0 hover:bg-emerald-500/[0.14] transition-colors"
                              style={{
                                top: `${(cellMin - s) * MIN_PX}px`,
                                height: `${30 * MIN_PX}px`,
                              }}
                              title={`Book at ${minToLabel(cellMin)} with ${t.name}`}
                              onClick={(ev) => {
                                if (!services || services.length === 0) return;
                                if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
                                ev.preventDefault();
                                setQuickBook({ date: dateStr, time: timeStr, therapistId: t.id });
                              }}
                            />
                          );
                        })}
                      </div>
                    );
                  })}

                {/* Where the dragged booking will land in this column. */}
                {drag?.active && drag.target?.therapistId === t.id && (
                  <div
                    className="absolute left-1 right-1 z-20 rounded-md border-2 border-dashed border-primary bg-primary/15 pointer-events-none p-2 text-[12px] font-semibold text-primary"
                    style={{
                      top: `${(drag.target.startMin - dayStartMin) * MIN_PX}px`,
                      height: `${drag.booking.variant.durationMin * MIN_PX}px`,
                    }}
                  >
                    {minToLabel(drag.target.startMin)} – {minToLabel(drag.target.startMin + drag.booking.variant.durationMin)}
                    <div className="font-normal">→ {t.name}</div>
                  </div>
                )}

                {ts.map((b) => {
                  const startMin = minutesFromMidnight(b.startsAt);
                  const top = (startMin - dayStartMin) * MIN_PX;
                  const height = b.variant.durationMin * MIN_PX;
                  if (top + height < 0 || top > (dayEndMin - dayStartMin) * MIN_PX) return null;
                  const c = paletteFor(b.service.category, b.status);
                  const cancelled = b.status === "CANCELLED" || b.status === "NO_SHOW";
                  const beingDragged = drag?.active && drag.booking.id === b.id;
                  const resizing = resize?.booking.id === b.id;
                  const shownHeight = resizing ? resize!.durationMin * MIN_PX : height;
                  const arrived = !!b.arrivedAt && (b.status === "PENDING" || b.status === "CONFIRMED");
                  return (
                    <div
                      key={b.id}
                      className={`group/card absolute left-1 right-1 ${cancelled ? "opacity-60" : ""} ${beingDragged ? "opacity-40" : ""} ${resizing ? "z-20" : ""} ${arrived ? "rounded-md ring-2 ring-sky-500 ring-offset-1" : ""}`}
                      style={{
                        top: `${top + 1}px`,
                        height: `${shownHeight - 2}px`,
                      }}
                    >
                      <Link
                        href={`/staff/bookings/${b.id}`}
                        draggable={false}
                        onDragStart={(e) => e.preventDefault()}
                        onPointerDown={(e) => onCardPointerDown(e, b, t.id)}
                        onPointerMove={onCardPointerMove}
                        onPointerUp={(e) => endDrag(e, false)}
                        onPointerCancel={(e) => endDrag(e, true)}
                        onContextMenu={(e) => {
                          // A long touch opens the phone's link menu, which
                          // cancels the drag. Mouse right-click is unaffected.
                          if (dragRef.current && dragRef.current.pointerType !== "mouse") e.preventDefault();
                        }}
                        title={canDrag(b) ? "Click for details · drag to move" : undefined}
                        onClick={(e) => {
                          if (suppressClick.current) {
                            e.preventDefault();
                            return;
                          }
                          // Plain click opens the pop-up; Ctrl/Cmd/Shift/middle
                          // click still opens the full page in a new tab.
                          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                          e.preventDefault();
                          setOpenBooking({
                            id: b.id,
                            startsAt: b.startsAt,
                            endsAt: b.endsAt,
                            status: b.status,
                            priceCents: b.priceCentsAtBooking,
                            serviceName: b.service.name,
                            durationMin: b.variant.durationMin,
                            clientId: b.client.id,
                            clientName: b.client.name,
                            clientPhone: b.client.phone,
                            therapistName: t.name,
                            needsIntakeForm: !!b.needsIntakeForm,
                            healthChanges: b.healthChanges ?? [],
                          });
                        }}
                        className="absolute inset-0 rounded-md p-2 text-[12px] leading-snug overflow-hidden border-l-[6px] shadow-sm hover:shadow-md transition-shadow block"
                        style={{
                          background: `hsl(var(--bk-${c}-bg))`,
                          borderLeftColor: `hsl(var(--bk-${c}-border))`,
                          color: `hsl(var(--bk-${c}-text))`,
                          // Press-and-hold is how phones start a drag, so stop
                          // the link preview / text selection taking it over.
                          ...(canDrag(b) ? { WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" } : {}),
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
                        {(b.needsIntakeForm || (b.healthChanges?.length ?? 0) > 0 || arrived || !!b.checkoutMethod || b.claimWithHealthFund) && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {arrived && (
                              <span className="inline-block rounded-sm bg-sky-600 text-white text-[9px] font-bold uppercase px-1 py-px tracking-wider">
                                Arrived
                              </span>
                            )}
                            {b.checkoutMethod && (
                              <span className="inline-block rounded-sm bg-emerald-700 text-white text-[9px] font-bold uppercase px-1 py-px tracking-wider">
                                Paid
                              </span>
                            )}
                            {b.claimWithHealthFund && (
                              <span className="inline-block rounded-sm bg-violet-600 text-white text-[9px] font-bold uppercase px-1 py-px tracking-wider">
                                HICAPS
                              </span>
                            )}
                            {b.needsIntakeForm && (
                              <span className="inline-block rounded-sm bg-amber-500 text-white text-[9px] font-bold uppercase px-1 py-px tracking-wider">
                                Form needed
                              </span>
                            )}
                            {(b.healthChanges?.length ?? 0) > 0 && (
                              <span className="inline-block rounded-sm bg-red-600 text-white text-[9px] font-bold uppercase px-1 py-px tracking-wider">
                                Health update
                              </span>
                            )}
                          </div>
                        )}
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
                      {resizing && (
                        <div className="absolute bottom-3 right-2 z-30 rounded bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground pointer-events-none">
                          {resize!.durationMin} min
                        </div>
                      )}
                      {canDrag(b) && variantsFor(b).length > 1 && (
                        <div
                          role="separator"
                          aria-label="Drag to change length"
                          title="Drag to change length"
                          className="absolute left-2 right-2 bottom-0 h-2.5 cursor-ns-resize flex items-end justify-center group touch-none"
                          onPointerDown={(e) => onResizeDown(e, b)}
                          onPointerMove={onResizeMove}
                          onPointerUp={onResizeUp}
                          onPointerCancel={() => setResize(null)}
                        >
                          <span className="mb-0.5 h-1 w-8 rounded-full bg-black/40 opacity-0 transition-opacity group-hover/card:opacity-100" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {openBooking && (
        <BookingDetailsDialog
          preview={openBooking}
          onClose={() => setOpenBooking(null)}
          onBookAgain={
            services && services.length > 0
              ? (initial) => {
                  setOpenBooking(null);
                  setQuickBook(initial);
                }
              : undefined
          }
        />
      )}
      {quickBook && services && (
        <QuickBookDialog
          initial={quickBook}
          services={services}
          therapists={therapists.filter((t) => t.isActive !== false).map((t) => ({ id: t.id, name: t.name }))}
          onClose={() => setQuickBook(null)}
          onBooked={(reference, date) => {
            setQuickBook(null);
            setBooked({ reference, date });
            router.refresh();
          }}
        />
      )}
      {pendingResize && (
        <MoveBookingDialog
          title="Change the length?"
          confirmLabel="Change length"
          clientName={pendingResize.booking.client.name}
          serviceLabel={pendingResize.booking.service.name}
          fromLabel={`${pendingResize.booking.variant.durationMin} min · ${formatPrice(pendingResize.booking.priceCentsAtBooking)}`}
          toLabel={`${pendingResize.variant.durationMin} min · ${formatPrice(pendingResize.variant.priceCents)}`}
          onConfirm={confirmResize}
          onClose={() => setPendingResize(null)}
        />
      )}
      {booked && (
        <div className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-md border bg-background shadow-lg px-4 py-3 text-sm flex items-center gap-3" role="status">
          <span>
            ✓ Booked <span className="font-mono">{booked.reference}</span>
            {booked.date !== dateStr ? ` for ${booked.date}` : ""}
          </span>
          {booked.date !== dateStr && (
            <a href={`/staff/schedule?date=${booked.date}`} className="text-primary font-medium hover:underline">
              View that day
            </a>
          )}
          <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Dismiss" onClick={() => setBooked(null)}>
            ×
          </button>
        </div>
      )}
      {pendingMove && (
        <MoveBookingDialog
          clientName={pendingMove.booking.client.name}
          serviceLabel={`${pendingMove.booking.variant.durationMin} min ${pendingMove.booking.service.name}`}
          fromLabel={`${therapistName(pendingMove.fromTherapistId)}, ${sydneyTimeShort(pendingMove.booking.startsAt)}`}
          toLabel={`${therapistName(pendingMove.target.therapistId)}, ${minToLabel(pendingMove.target.startMin)}`}
          warning={shiftWarning(pendingMove.target, pendingMove.booking.variant.durationMin)}
          onConfirm={confirmMove}
          onClose={() => setPendingMove(null)}
        />
      )}
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
