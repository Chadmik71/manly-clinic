"use client";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPrice, formatDuration } from "@/lib/utils";

type Service = {
  id: string;
  name: string;
  variants: { id: string; durationMin: number; priceCents: number }[];
};
type Client = { id: string; name: string; email: string; phone: string | null };
type Therapist = { id: string; name: string };

export function NewBookingForm({
  action,
  clients,
  services,
  therapists,
}: {
  action: (
    formData: FormData,
  ) => Promise<{ ok?: boolean; error?: string; reference?: string }>;
  clients: Client[];
  services: Service[];
  therapists: Therapist[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState<"existing" | "walkin">("existing");
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? "");
  const [variantId, setVariantId] = useState<string>(
    services[0]?.variants[0]?.id ?? "",
  );
  const [filter, setFilter] = useState("");

  const variants = useMemo(
    () => services.find((s) => s.id === serviceId)?.variants ?? [],
    [services, serviceId],
  );

  const filteredClients = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return clients.slice(0, 50);
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q) ||
          (c.phone ?? "").includes(q),
      )
      .slice(0, 50);
  }, [clients, filter]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData(e.currentTarget);
    fd.set("mode", mode);
    fd.set("serviceId", serviceId);
    fd.set("variantId", variantId);
    start(async () => {
      const res = await action(fd);
      if (res?.error) setError(res.error);
      else if (res?.reference) {
        setSuccess(`Booking ${res.reference} created.`);
        (e.target as HTMLFormElement).reset();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="flex gap-2 text-sm">
        <button
          type="button"
          onClick={() => setMode("existing")}
          className={`rounded-md border px-3 py-1.5 ${mode === "existing" ? "border-primary bg-primary/5 text-primary" : ""}`}
        >
          Existing client
        </button>
        <button
          type="button"
          onClick={() => setMode("walkin")}
          className={`rounded-md border px-3 py-1.5 ${mode === "walkin" ? "border-primary bg-primary/5 text-primary" : ""}`}
        >
          Walk-in / new
        </button>
      </div>

      {mode === "existing" ? (
        <div className="space-y-2">
          <Label>Search client</Label>
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Name, email or phone…"
          />
          <select
            name="clientId"
            required
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">— select client —</option>
            {filteredClients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.email}
                {c.phone ? ` · ${c.phone}` : ""}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="walkInName">Name</Label>
            <Input id="walkInName" name="walkInName" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="walkInPhone">Phone</Label>
            <Input
              id="walkInPhone"
              name="walkInPhone"
              type="tel"
              placeholder="0400 000 000"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="walkInEmail">Email (optional)</Label>
            <Input id="walkInEmail" name="walkInEmail" type="email" />
            <p className="text-xs text-muted-foreground">
              If omitted, a synthetic placeholder email will be generated. The
              client can later sign up using their real email to claim the
              record.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Service</Label>
          <select
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setVariantId(
                services.find((s) => s.id === e.target.value)?.variants[0]
                  ?.id ?? "",
              );
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
        <div className="space-y-1.5">
          <Label htmlFor="startsAt">Starts at</Label>
          <Input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="therapistId">Therapist</Label>
          <select
            id="therapistId"
            name="therapistId"
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">— auto-assign —</option>
            {therapists.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" name="notes" placeholder="Internal notes…" />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-emerald-600">{success}</p>}
      <div className="flex gap-3 justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Creating…" : "Create booking"}
        </Button>
      </div>
    </form>
  );
}
