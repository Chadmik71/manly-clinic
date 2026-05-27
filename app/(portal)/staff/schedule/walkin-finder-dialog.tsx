"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { Footprints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findWalkinSlots } from "./actions";

type Slot = {
  startsAtIso: string;
  endsAtIso: string;
  therapistId: string;
  therapistName: string;
};

const DURATIONS = [30, 45, 60, 90] as const;

const SYD_TIME = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

// /staff/bookings/new expects time as "HH:mm" 24-hour Sydney-local —
// regex is /^\d{2}:\d{2}$/. en-GB hour12:false gives that format reliably.
const SYD_TIME_24 = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Australia/Sydney",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

// /staff/bookings/new expects date as Sydney calendar yyyy-MM-dd, not the
// UTC date that .toISOString().slice(0,10) would give for late-evening
// Sydney bookings. en-CA gives ISO-format yyyy-MM-dd.
const SYD_DATE_ISO = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function minutesUntil(iso: string): number {
  const d = new Date(iso);
  return Math.max(0, Math.round((d.getTime() - Date.now()) / 60000));
}

export function WalkinFinderDialog() {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(60);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function fetchSlots(forDuration: number) {
    setError(null);
    start(async () => {
      const res = await findWalkinSlots(forDuration);
      if (res.ok) {
        setSlots(res.slots);
      } else {
        setError(res.error);
        setSlots([]);
      }
    });
  }

  // Fetch on open and whenever duration changes.
  useEffect(() => {
    if (open) fetchSlots(duration);
  }, [open, duration]);

  // Esc-to-close for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Footprints className="h-4 w-4 mr-1" />
        Walk-in
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="walkin-title"
        >
          <div className="bg-background w-full sm:max-w-md rounded-t-lg sm:rounded-lg p-5 shadow-xl border max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h2 id="walkin-title" className="text-lg font-semibold">
                Walk-in: next available slots
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted-foreground hover:text-foreground text-2xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                  Session length
                </div>
                <div className="grid grid-cols-4 gap-1.5">
                  {DURATIONS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDuration(d)}
                      className={`rounded-md border px-2 py-2 text-sm transition-colors ${
                        d === duration
                          ? "border-primary bg-primary/10 text-primary font-semibold"
                          : "hover:bg-accent"
                      }`}
                    >
                      {d} min
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                  Soonest open ({duration} min)
                </div>
                {pending ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Checking availability…
                  </p>
                ) : error ? (
                  <p className="text-sm text-destructive py-2">{error}</p>
                ) : slots.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center rounded-md border border-dashed">
                    No {duration}-min slots left today.
                  </p>
                ) : (
                  <ul className="space-y-1.5">
                    {slots.map((s) => {
                      const slotDate = new Date(s.startsAtIso);
                      const mins = minutesUntil(s.startsAtIso);
                      const dateStr = SYD_DATE_ISO.format(slotDate);
                      const timeParam = SYD_TIME_24.format(slotDate);
                      const href =
                        `/staff/bookings/new?date=${dateStr}` +
                        `&therapistId=${encodeURIComponent(s.therapistId)}` +
                        `&time=${encodeURIComponent(timeParam)}`;
                      return (
                        <li
                          key={s.startsAtIso + s.therapistId}
                          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent"
                        >
                          <div>
                            <div className="font-semibold tabular-nums">
                              {SYD_TIME.format(new Date(s.startsAtIso))}
                              <span className="text-muted-foreground font-normal ml-2 text-xs">
                                {mins === 0
                                  ? "now"
                                  : mins < 60
                                    ? `in ${mins} min`
                                    : `in ${Math.floor(mins / 60)}h ${mins % 60 ? `${mins % 60}m` : ""}`}
                              </span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {s.therapistName}
                            </div>
                          </div>
                          <Button asChild size="sm">
                            <Link
                              href={href}
                              onClick={() => setOpen(false)}
                            >
                              Book
                            </Link>
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
