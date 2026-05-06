"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Therapist = { id: string; name: string };
type Variant = {
  id: string;
  serviceName: string;
  durationMin: number;
  priceCents: number;
};

/**
 * Edit the core appointment fields: time, customer-facing therapist (slot),
 * and service variant. Hidden behind a "Edit" toggle on the booking detail
 * page so the read-only view is preserved by default.
 */
export function EditAppointmentForm({
  bookingId,
  currentStartsAt,
  currentTherapistId,
  currentVariantId,
  therapists,
  variants,
  action,
}: {
  bookingId: string;
  /** "YYYY-MM-DDTHH:mm" Sydney wall-clock pre-fill for the input. */
  currentStartsAt: string;
  /** Empty string for unassigned. */
  currentTherapistId: string;
  currentVariantId: string;
  therapists: Therapist[];
  variants: Variant[];
  action: (
    bookingId: string,
    data: { startsAt: string; therapistId: string; variantId: string },
  ) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [startsAt, setStartsAt] = useState(currentStartsAt);
  const [therapistId, setTherapistId] = useState(currentTherapistId);
  const [variantId, setVariantId] = useState(currentVariantId);

  function reset() {
    setStartsAt(currentStartsAt);
    setTherapistId(currentTherapistId);
    setVariantId(currentVariantId);
    setError(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await action(bookingId, {
        startsAt,
        therapistId,
        variantId,
      });
      if (res.error) {
        setError(res.error);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit appointment
      </Button>
    );
  }

  const selectClass =
    "h-10 w-full rounded-md border bg-background px-3 text-sm";

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="ea-startsAt">Starts at</Label>
        <Input
          id="ea-startsAt"
          type="datetime-local"
          required
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ea-therapistId">Therapist (slot)</Label>
        <select
          id="ea-therapistId"
          value={therapistId}
          onChange={(e) => setTherapistId(e.target.value)}
          className={selectClass}
        >
          <option value="">— Unassigned —</option>
          {therapists.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ea-variantId">Service / duration</Label>
        <select
          id="ea-variantId"
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
          className={selectClass}
          required
        >
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.serviceName} — {v.durationMin} min ($
              {(v.priceCents / 100).toFixed(2)})
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
