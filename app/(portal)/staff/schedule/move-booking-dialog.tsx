"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

/**
 * Confirmation shown after a booking card is dragged to another staff column
 * or time on the calendar. Nothing moves until staff press "Move booking";
 * the move goes through the same checks as "Edit appointment" (clashes,
 * blocked time, opening hours), and any refusal is shown here.
 */
export function MoveBookingDialog({
  clientName,
  serviceLabel,
  fromLabel,
  toLabel,
  warning,
  onConfirm,
  onClose,
}: {
  clientName: string;
  serviceLabel: string;
  fromLabel: string;
  toLabel: string;
  /** Shown when the new time is outside that staff member's shift. */
  warning?: string | null;
  onConfirm: () => Promise<{ error?: string }>;
  onClose: () => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  function confirm() {
    setError(null);
    start(async () => {
      const res = await onConfirm();
      if (res.error) setError(res.error);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="move-booking-title"
      onClick={() => !pending && onClose()}
    >
      <div
        className="bg-background w-full sm:max-w-md rounded-t-lg sm:rounded-lg p-5 shadow-xl border"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="move-booking-title" className="text-lg font-semibold mb-1">
          Move this booking?
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          {clientName} · {serviceLabel}
        </p>
        <dl className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">From</dt>
          <dd>{fromLabel}</dd>
          <dt className="text-muted-foreground">To</dt>
          <dd className="font-semibold">{toLabel}</dd>
        </dl>
        {warning && (
          <p className="text-sm mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            {warning}
          </p>
        )}
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={confirm} disabled={pending}>
            {pending ? "Moving…" : "Move booking"}
          </Button>
        </div>
      </div>
    </div>
  );
}
