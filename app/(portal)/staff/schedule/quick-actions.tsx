"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical, CheckCircle2, UserX, ClipboardList } from "lucide-react";
import { setBookingStatus } from "@/app/(portal)/staff/bookings/[id]/actions";

type Props = {
  bookingId: string;
  clientId: string;
  status: string;
};

/**
 * Tiny floating menu overlaid on a booking card in the schedule grid.
 * Lets staff mark complete / no-show, jump to the client's intake
 * history, or open the booking detail page — without first clicking
 * into the booking. Two-tap actions for the common ops you do all day.
 */
export function BookingQuickActions({ bookingId, clientId, status }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Click outside to close.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDocClick);
    return () => window.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Esc-to-close for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function setStatus(next: string) {
    setError(null);
    start(async () => {
      const res = await setBookingStatus(bookingId, next);
      if (res.error) {
        setError(res.error);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  const canComplete = status !== "COMPLETED" && status !== "CANCELLED";
  const canNoShow = status !== "NO_SHOW" && status !== "CANCELLED";

  return (
    <div className="relative z-10" ref={ref}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Quick actions"
        className="grid place-items-center h-6 w-6 rounded-md bg-black/10 hover:bg-black/20 text-current"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-7 w-48 rounded-md border bg-popover text-popover-foreground shadow-lg p-1 text-xs"
          role="menu"
          onClick={(e) => {
            // Stop bubbling so a click inside the menu doesn't trigger the
            // parent booking card's navigation.
            e.stopPropagation();
          }}
        >
          {canComplete && (
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => setStatus("COMPLETED")}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm hover:bg-accent disabled:opacity-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Mark complete
            </button>
          )}
          {canNoShow && (
            <button
              type="button"
              role="menuitem"
              disabled={pending}
              onClick={() => setStatus("NO_SHOW")}
              className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm hover:bg-accent disabled:opacity-50"
            >
              <UserX className="h-3.5 w-3.5 text-amber-600" />
              Mark no-show
            </button>
          )}
          <Link
            href={`/staff/clients/${clientId}/intake-history`}
            role="menuitem"
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm hover:bg-accent"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            View intake history
          </Link>
          <Link
            href={`/staff/bookings/${bookingId}`}
            role="menuitem"
            className="flex items-center gap-2 w-full px-2 py-1.5 rounded-sm hover:bg-accent border-t mt-1 pt-2"
          >
            Open booking →
          </Link>
          {error && (
            <p className="px-2 py-1 text-destructive text-[10px]">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
