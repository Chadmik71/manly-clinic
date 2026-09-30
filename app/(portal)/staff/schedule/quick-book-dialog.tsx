"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/utils";
import { createStaffBooking, searchClients } from "@/app/(portal)/staff/bookings/new/actions";

export type QuickBookService = {
  id: string;
  name: string;
  slug: string;
  healthFundEligible: boolean;
  variants: { id: string; durationMin: number; priceCents: number }[];
};

export type QuickBookInitial = {
  date: string; // YYYY-MM-DD (Sydney)
  time: string; // HH:mm
  therapistId: string;
  client?: { id: string; name: string; phone: string | null };
  serviceId?: string;
  variantId?: string;
  /** Heading override, e.g. "Book again". */
  title?: string;
};

type ClientHit = { id: string; name: string; email: string; phone: string | null };

/**
 * Book straight from the calendar without leaving it: time and staff member
 * come from the slot that was tapped (or from "Book again"). Uses the same
 * server action as the full New booking page, so the same checks apply.
 * Health-fund claims and pregnancy bookings need the full form + signature,
 * so those link out to the full page (or the medical form is completed at
 * the clinic via "Complete medical form").
 */
export function QuickBookDialog({
  initial,
  services,
  therapists,
  onClose,
  onBooked,
}: {
  initial: QuickBookInitial;
  services: QuickBookService[];
  therapists: { id: string; name: string }[];
  onClose: () => void;
  onBooked: (reference: string, date: string, notified?: string) => void;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"existing" | "new">(initial.client ? "existing" : "existing");
  const [client, setClient] = useState<ClientHit | null>(
    initial.client ? { ...initial.client, email: "" } : null,
  );
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ClientHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const firstBookable = services.find((s) => s.slug !== "pregnancy-massage") ?? services[0];
  const [serviceId, setServiceId] = useState(initial.serviceId ?? firstBookable?.id ?? "");
  const service = services.find((s) => s.id === serviceId);
  const [variantId, setVariantId] = useState(initial.variantId ?? service?.variants[0]?.id ?? "");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [therapistId, setTherapistId] = useState(initial.therapistId);
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [marketingOk, setMarketingOk] = useState(false);
  const searchSeq = useRef(0);

  // Keep the duration valid when the service changes.
  useEffect(() => {
    if (service && !service.variants.some((v) => v.id === variantId)) {
      setVariantId(service.variants[0]?.id ?? "");
    }
  }, [service, variantId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  // Debounced client search (name, phone, email, reference).
  useEffect(() => {
    if (mode !== "existing" || client || query.trim().length < 2) {
      setHits([]);
      return;
    }
    const seq = ++searchSeq.current;
    setSearching(true);
    const t = window.setTimeout(async () => {
      const res = await searchClients(query.trim());
      if (seq !== searchSeq.current) return;
      setSearching(false);
      setHits(res.clients?.slice(0, 8) ?? []);
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, mode, client]);

  const isPregnancy = service?.slug === "pregnancy-massage";
  const fullFormHref = `/staff/bookings/new?date=${encodeURIComponent(date)}&therapistId=${encodeURIComponent(therapistId)}&time=${encodeURIComponent(time)}`;
  const variantLabel = useMemo(
    () => (v: { durationMin: number; priceCents: number }) => `${v.durationMin} min · ${formatPrice(v.priceCents)}`,
    [],
  );

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (mode === "existing" && !client) return setError("Search for the client and pick them, or switch to New client.");
    if (mode === "new" && !newName.trim()) return setError("Enter the client's name.");
    if (isPregnancy) return setError("Pregnancy bookings need the full form. Use the full booking form below.");
    if (!consent) return setError("Please confirm the client consents to treatment.");
    const fd = new FormData();
    if (mode === "existing" && client) {
      fd.set("mode", "existing");
      fd.set("clientId", client.id);
    } else {
      fd.set("mode", "walkin");
      fd.set("walkInName", newName.trim());
      fd.set("walkInPhone", newPhone.trim());
      fd.set("walkInEmail", newEmail.trim());
    }
    fd.set("serviceId", serviceId);
    fd.set("variantId", variantId);
    fd.set("startsAt", `${date}T${time}`);
    fd.set("therapistId", therapistId);
    if (notes.trim()) fd.set("notes", notes.trim());
    fd.set("consentToTreat", "on");
    if (sendConfirmation) fd.set("sendConfirmation", "on");
    if (marketingOk) fd.set("marketingConsent", "on");
    start(async () => {
      const res = await createStaffBooking(fd);
      if (res.error) setError(res.error);
      else if (res.reference) onBooked(res.reference, date, res.notified);
    });
  }

  const tabClass = (on: boolean) =>
    `rounded-md border px-3 py-1.5 text-sm ${on ? "border-primary bg-primary/5 text-primary" : "hover:bg-accent"}`;
  const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-book-title"
      onClick={() => !pending && onClose()}
    >
      <form
        onSubmit={submit}
        className="bg-background w-full sm:max-w-lg rounded-t-lg sm:rounded-lg p-5 shadow-xl border max-h-[90vh] overflow-y-auto space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id="quick-book-title" className="text-lg font-semibold">
            {initial.title ?? "New booking"}
          </h2>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground text-2xl leading-none" aria-label="Close">
            ×
          </button>
        </div>

        {/* Client */}
        <div className="space-y-2">
          <div className="flex gap-2">
            <button type="button" className={tabClass(mode === "existing")} onClick={() => setMode("existing")}>
              Existing client
            </button>
            <button type="button" className={tabClass(mode === "new")} onClick={() => { setMode("new"); setClient(null); }}>
              New client
            </button>
          </div>
          {mode === "existing" ? (
            client ? (
              <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{client.name}</span>
                  {client.phone && <span className="text-muted-foreground"> · {client.phone}</span>}
                </span>
                <button type="button" className="text-primary text-sm hover:underline" onClick={() => { setClient(null); setQuery(""); }}>
                  Change
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="qb-search" className="sr-only">Search client</Label>
                <Input
                  id="qb-search"
                  autoFocus
                  placeholder="Search name, phone or email…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                />
                {searching && <p className="text-xs text-muted-foreground">Searching…</p>}
                {hits.length > 0 && (
                  <ul className="rounded-md border divide-y max-h-48 overflow-y-auto">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-accent" onClick={() => setClient(h)}>
                          <span className="font-medium">{h.name}</span>
                          <span className="text-muted-foreground"> · {h.phone ?? h.email}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!searching && query.trim().length >= 2 && hits.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No match.{" "}
                    <button type="button" className="text-primary hover:underline" onClick={() => { setMode("new"); setNewName(query.trim()); }}>
                      Add as a new client
                    </button>
                  </p>
                )}
              </div>
            )
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="qb-name">Name</Label>
                <Input id="qb-name" value={newName} onChange={(e) => setNewName(e.target.value)} required />
              </div>
              <div className="space-y-1">
                <Label htmlFor="qb-phone">Phone</Label>
                <Input id="qb-phone" type="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="0400 000 000" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="qb-email">Email (optional)</Label>
                <Input id="qb-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* Service + time */}
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="qb-service">Service</Label>
            <select id="qb-service" className={selectClass} value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="qb-variant">Length</Label>
            <select id="qb-variant" className={selectClass} value={variantId} onChange={(e) => setVariantId(e.target.value)}>
              {service?.variants.map((v) => (
                <option key={v.id} value={v.id}>{variantLabel(v)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="qb-date">Date</Label>
            <Input id="qb-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="qb-time">Time</Label>
            <Input id="qb-time" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} required />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="qb-therapist">Staff</Label>
            <select id="qb-therapist" className={selectClass} value={therapistId} onChange={(e) => setTherapistId(e.target.value)}>
              {therapists.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="qb-notes">Notes (optional)</Label>
            <Input id="qb-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. prefers firm pressure" />
          </div>
        </div>

        {service?.healthFundEligible && (
          <p className="text-xs text-muted-foreground rounded-md bg-muted/50 px-3 py-2">
            Claiming with a health fund? Book it here, then when the client arrives use
            &ldquo;Complete medical form&rdquo; on the booking to add the fund and signature.
          </p>
        )}
        {isPregnancy && (
          <p className="text-sm rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
            Pregnancy bookings need the full safety form and a signature.{" "}
            <Link href={fullFormHref} className="text-primary underline">Use the full booking form</Link>.
          </p>
        )}

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>The client consents to receiving treatment.</span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={sendConfirmation} onChange={(e) => setSendConfirmation(e.target.checked)} />
          <span>
            Send the client a confirmation (email and/or text).
            <span className="block text-xs text-muted-foreground">Untick for a walk-in who is here now.</span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={marketingOk} onChange={(e) => setMarketingOk(e.target.checked)} />
          <span>
            Client is happy to get an occasional message from us (thank-you and review request after a visit).
            <span className="block text-xs text-muted-foreground">Ask them first. Leave unticked if unsure.</span>
          </span>
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={fullFormHref} className="text-sm text-muted-foreground hover:text-foreground underline">
            Open full booking form
          </Link>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Booking…" : "Book"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
