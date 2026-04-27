import Link from "next/link";
import { format } from "date-fns";
import { formatPrice } from "@/lib/utils";

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
  startMin?: number;
  endMin?: number;
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

function minutesFromMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

export function ScheduleGrid({
  date,
  therapists,
  bookings,
}: {
  date: Date;
  therapists: Therapist[];
  bookings: Booking[];
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
              <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                {t.initials}
              </span>
              <div className="text-sm">
                <div className="font-medium leading-none">{t.name}</div>
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
                        {format(b.startsAt, "h:mm a")} – {format(b.endsAt, "h:mm a")}
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
