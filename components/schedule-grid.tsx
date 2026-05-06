import Link from "next/link";
import { sydneyTimeShort, SYDNEY_TZ } from "@/lib/time";
import { formatPrice } from "@/lib/utils";
import { TherapistQuickActions } from "@/components/therapist-quick-actions";

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 21; // exclusive
const HOUR_PX = 80;
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
  client: { name: string; phone: string | null };
  therapistId: string | null;
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
}) {
  const dayStartMin = DAY_START_HOUR * 60;
  const dayEndMin = DAY_END_HOUR * 60;

  return (
    <div className="border rounded-md bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `64px repeat(${Math.max(therapists.length, 1)}, minmax(${COL_MIN_W}px, 1fr))`,
          }}
        >
          {/* Header row */}
          <div className="border-b border-r bg-muted/30 h-12" />
          {therapists.map((t) => (
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
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {minToLabel(t.startMin)} – {minToLabel(t.endMin)}
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
          ))}

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
          </div>

          {therapists.map((t) => {
            const ts = bookings.filter((b) => b.therapistId === t.id);
            return (
              <div
                key={t.id}
                className="relative border-r last:border-r-0"
                style={{
                  height: `${(DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX}px`,
                  backgroundImage:
                    "repeating-linear-gradient(to bottom, hsl(var(--grid)) 0 1px, transparent 1px " +
                    HOUR_PX +
                    "px)",
                }}
              >
                {/* Off-hours overlay */}
                {!t.isWorking && (
                  <div className="absolute inset-0 bg-muted/40 pointer-events-none" />
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
                    <div
                      key={o.id}
                      className="absolute left-0 right-0 bg-muted-foreground/15 pointer-events-none border-l-2 border-muted-foreground/30"
                      style={{ top: `${top}px`, height: `${height}px` }}
                      title={o.reason ?? "Time off / break"}
                    >
                      {height >= 18 && (
                        <div className="text-[10px] text-muted-foreground p-1.5 leading-tight italic truncate">
                          {o.reason ?? "Off"}
                        </div>
                      )}
                    </div>
                  );
                })}
                {t.isWorking &&
                  t.startMin != null &&
                  t.startMin > dayStartMin && (
                    <div
                      className="absolute left-0 right-0 bg-muted/40 pointer-events-none"
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
                      className="absolute left-0 right-0 bg-muted/40 pointer-events-none"
                      style={{
                        top: `${(t.endMin - dayStartMin) * MIN_PX}px`,
                        bottom: 0,
                      }}
                    />
                  )}

                {ts.map((b) => {
                  const startMin = minutesFromMidnight(b.startsAt);
                  const top = (startMin - dayStartMin) * MIN_PX;
                  const height = b.variant.durationMin * MIN_PX;
                  if (top + height < 0 || top > (dayEndMin - dayStartMin) * MIN_PX) return null;
                  const c = paletteFor(b.service.category, b.status);
                  const cancelled = b.status === "CANCELLED" || b.status === "NO_SHOW";
                  return (
                    <Link
                      key={b.id}
                      href={`/staff/bookings/${b.id}`}
                      className={`absolute left-1 right-1 rounded-md p-2 text-[11px] leading-tight overflow-hidden border-l-4 hover:shadow-md transition-shadow ${cancelled ? "opacity-60" : ""}`}
                      style={{
                        top: `${top + 1}px`,
                        height: `${height - 2}px`,
                        background: `hsl(var(--bk-${c}-bg))`,
                        borderLeftColor: `hsl(var(--bk-${c}-border))`,
                        color: `hsl(var(--bk-${c}-text))`,
                      }}
                    >
                      <div className="font-semibold">
                        {sydneyTimeShort(b.startsAt)} – {sydneyTimeShort(b.endsAt)}
                      </div>
                      {b.client.phone && (
                        <div className="opacity-75 truncate">{b.client.phone}</div>
                      )}
                      <div className="font-medium truncate">{b.client.name}</div>
                      <div className="opacity-80 truncate">
                        {b.variant.durationMin} min {b.service.name}
                      </div>
                      <div className="font-semibold mt-0.5">
                        {formatPrice(b.priceCentsAtBooking)}
                      </div>
                    </Link>
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
