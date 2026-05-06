"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice, formatDuration } from "@/lib/utils";

type Variant = { id: string; durationMin: number; priceCents: number };
type Service = { id: string; name: string; variants: Variant[] };
type Slot = { id: string; label: string };
type Client = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  isWalkIn: boolean;
};
type Booking = {
  id: string;
  reference: string;
  serviceId: string;
  variantId: string;
  /** "YYYY-MM-DDTHH:mm" in Sydney time, ready for datetime-local. */
  startsAtLocal: string;
  slotId: string;
  notes: string;
  client: Client;
};

export function EditBookingForm({
  action,
  booking,
  services,
  slots,
}: {
  action: (
    fd: FormData,
  ) => Promise<{ ok?: boolean; error?: string }>;
  booking: Booking;
  services: Service[];
  slots: Slot[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [serviceId, setServiceId] = useState(booking.serviceId);
  const [variantId, setVariantId] = useState(booking.variantId);

  const variants =
    services.find((s) => s.id === serviceId)?.variants ?? [];

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData(e.currentTarget);
    fd.set("bookingId", booking.id);
    fd.set("serviceId", serviceId);
    fd.set("variantId", variantId);
    start(async () => {
      const res = await action(fd);
      if (res?.error) {
        setError(res.error);
      } else {
        setSuccess("Saved.");
        // Bounce back to the detail page after a short pause.
        setTimeout(() => {
          router.push(`/staff/bookings/${booking.id}`);
          router.refresh();
        }, 600);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {/* Client (read-only summary) */}
      <div className="rounded-md border bg-muted/30 p-3 text-sm">
        <div className="text-xs text-muted-foreground mb-1">Client</div>
        <div className="font-medium">{booking.client.name}</div>
        <div className="text-muted-foreground">
          {booking.client.email}
          {booking.client.phone ? ` · ${booking.client.phone}` : ""}
          {booking.client.isWalkIn ? " · walk-in" : ""}
        </div>
      </div>

      {/* Service + duration */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Service</Label>
          <select
            value={serviceId}
            onChange={(e) => {
              const newId = e.target.value;
              setServiceId(newId);
              const firstVariant = services.find((s) => s.id === newId)
                ?.variants[0];
              setVariantId(firstVariant?.id ?? "");
            }}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Duration</Label>
          <select
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            {variants.map((v) => (
              <option key={v.id} value={v.id}>
                {formatDuration(v.durationMin)} · {formatPrice(v.priceCents)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Time + slot */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="startsAt">Starts at</Label>
          <Input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={booking.startsAtLocal}
          />
          <p className="text-[11px] text-muted-foreground">
            End time is computed from the duration above.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="slotId">Slot (customer-facing)</Label>
          <select
            id="slotId"
            name="slotId"
            defaultValue={booking.slotId}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">— unassigned —</option>
            {slots.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Walk-in client editing */}
      {booking.client.isWalkIn && (
        <div className="rounded-md border p-3 space-y-3">
          <div className="text-xs text-muted-foreground">
            Walk-in client details
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="walkInName">Name</Label>
              <Input
                id="walkInName"
                name="walkInName"
                defaultValue={booking.client.name}
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="walkInPhone">Phone</Label>
              <Input
                id="walkInPhone"
                name="walkInPhone"
                type="tel"
                defaultValue={booking.client.phone ?? ""}
                maxLength={40}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="walkInEmail">Email</Label>
              <Input
                id="walkInEmail"
                name="walkInEmail"
                type="email"
                defaultValue={booking.client.email}
                maxLength={120}
              />
              <p className="text-[11px] text-muted-foreground">
                Changing the email here updates the underlying client record.
                Real (non-walk-in) clients aren&rsquo;t edited from this form.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Internal notes */}
      <div className="space-y-1.5">
        <Label htmlFor="notes">Internal notes</Label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={booking.notes}
          placeholder="Anything staff should know about this booking…"
          maxLength={2000}
          rows={3}
        />
        <p className="text-[11px] text-muted-foreground">
          Internal only — not shown to the client. Clinical SOAP notes are
          managed on the booking detail page.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive whitespace-pre-line">{error}</p>
      )}
      {success && <p className="text-sm text-emerald-600">{success}</p>}

      <div className="flex gap-3 justify-end">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(`/staff/bookings/${booking.id}`)}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
