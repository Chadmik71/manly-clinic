"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { formatPrice, formatDuration } from "@/lib/utils";
import { SignaturePad } from "@/components/signature-pad";
import { HEALTH_FUNDS } from "@/lib/intake";
import { searchClients } from "./actions";

type Service = {
  id: string;
  name: string;
  healthFundEligible: boolean;
  variants: { id: string; durationMin: number; priceCents: number }[];
};
type Client = { id: string; name: string; email: string; phone: string | null };
type Therapist = { id: string; name: string };

export function NewBookingForm({
  action,
  clients,
  services,
  therapists,
  initialStartsAt,
  initialTherapistId,
}: {
  action: (
    formData: FormData,
  ) => Promise<{ ok?: boolean; error?: string; reference?: string }>;
  clients: Client[];
  services: Service[];
  therapists: Therapist[];
  /** "YYYY-MM-DDTHH:mm" — pre-fills the startsAt input. */
  initialStartsAt?: string;
  /** Pre-selects this therapist (or empty/undefined for auto-assign). */
  initialTherapistId?: string;
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
  const [claiming, setClaiming] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  // Non-claim bookings record consent via this tick-box instead of a drawn
  // signature (faster for walk-ins).
  const [consentChecked, setConsentChecked] = useState(false);

  // Split the single datetime-local control into a date input + a time
  // dropdown — Chrome/desktop only opens the date popup, leaving time as a
  // keyboard-only field. Time options run 9:00 am to 7:45 pm in 15-min steps,
  // matching the clinic-wide BOOKING_EARLIEST_START_MIN / LATEST_END windows.
  const initialDate = initialStartsAt?.slice(0, 10) ?? "";
  const initialTime = initialStartsAt?.slice(11, 16) ?? "09:00";
  const [dateValue, setDateValue] = useState(initialDate);
  const [timeValue, setTimeValue] = useState(initialTime);

  const timeOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (let m = 9 * 60; m <= 19 * 60 + 45; m += 15) {
      const hh = Math.floor(m / 60);
      const mm = m % 60;
      const value = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
      const period = hh < 12 ? "am" : "pm";
      const h12 = hh % 12 === 0 ? 12 : hh % 12;
      opts.push({ value, label: `${h12}:${String(mm).padStart(2, "0")} ${period}` });
    }
    return opts;
  }, []);

  const variants = useMemo(
    () => services.find((s) => s.id === serviceId)?.variants ?? [],
    [services, serviceId],
  );
  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );
  const healthFundEligible = selectedService?.healthFundEligible ?? false;
  // If the user switches to a non-eligible service after toggling claim on,
  // collapse the claim block silently so stale state isn't shipped to the server.
  const claimActive = claiming && healthFundEligible;
  // Auto-tick the claim checkbox whenever the selected service is
  // health-fund-eligible (Remedial Massage today) — customers booking
  // those services almost always do so *to* claim. Staff can still
  // untick if a particular client is paying cash this visit. Switching
  // to a non-eligible service auto-collapses the claim section via
  // claimActive above.
  useEffect(() => {
    setClaiming(healthFundEligible);
  }, [healthFundEligible]);

  // Server-side client search (debounced). The clinic has thousands of
  // imported clients, so an in-browser filter over a preloaded subset
  // misses most of them. We start with the initial 50-or-so passed from
  // the page and replace via the searchClients action as the admin types.
  const [filteredClients, setFilteredClients] = useState<Client[]>(clients);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const res = await searchClients(filter);
      if (res.clients) setFilteredClients(res.clients);
      setSearching(false);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filter]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData(e.currentTarget);
    fd.set("mode", mode);
    fd.set("serviceId", serviceId);
    fd.set("variantId", variantId);
    if (!dateValue) {
      setError("Please pick a date.");
      return;
    }
    fd.set("startsAt", `${dateValue}T${timeValue}`);
    // Claim bookings need a fresh drawn signature (HiCAPS audit); non-claim
    // bookings record consent via the tick-box. Validate client-side so staff
    // don't dispatch a half-filled booking.
    if (claimActive) {
      if (!signatureDataUrl) {
        setError("Please ask the client to sign in the signature pad.");
        return;
      }
      fd.set("signatureDataUrl", signatureDataUrl);
      fd.set("claimWithHealthFund", "on");
    } else {
      if (!consentChecked) {
        setError("Please confirm the client consents to treatment.");
        return;
      }
      fd.set("consentToTreat", "on");
      // Defensive: ensure no stale signature / claim fields ship if the user
      // toggled the claim section off after filling it in.
      fd.delete("signatureDataUrl");
      fd.delete("claimWithHealthFund");
      fd.delete("healthFundName");
      fd.delete("healthFundMemberNumber");
      fd.delete("reasonForTreatment");
    }
    start(async () => {
      const res = await action(fd);
      if (res?.error) setError(res.error);
      else if (res?.reference) {
        setSuccess(`Booking ${res.reference} created.`);
        (e.target as HTMLFormElement).reset();
        setClaiming(false);
        setSignatureDataUrl(null);
        setConsentChecked(false);
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
          <div className="flex items-center justify-between">
            <Label>Search client</Label>
            {searching && (
              <span className="text-xs text-muted-foreground">Searching…</span>
            )}
          </div>
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
          {filter.trim() !== "" && filteredClients.length === 0 && !searching && (
            <p className="text-xs text-muted-foreground">
              No matching clients. Try a different name, email or phone, or use
              &ldquo;Walk-in / new&rdquo; above.
            </p>
          )}
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
          <Label htmlFor="startsAtDate">Date</Label>
          <Input
            id="startsAtDate"
            type="date"
            required
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="startsAtTime">Time</Label>
          <select
            id="startsAtTime"
            value={timeValue}
            onChange={(e) => setTimeValue(e.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            {timeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="therapistId">Therapist</Label>
          <select
            id="therapistId"
            name="therapistId"
            defaultValue={initialTherapistId ?? ""}
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

      {healthFundEligible && (
        <div className="rounded-md border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="success">Health fund rebatable</Badge>
            <span className="text-xs text-muted-foreground">
              Capture HiCAPS details + signature now if claiming today
            </span>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={claiming}
              onChange={(e) => {
                setClaiming(e.target.checked);
                if (!e.target.checked) setSignatureDataUrl(null);
              }}
              className="mt-1"
            />
            <span>Client is claiming this session with their health fund.</span>
          </label>
          {claimActive && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="healthFundName">
                  Health fund <span className="text-destructive">*</span>
                </Label>
                <select
                  id="healthFundName"
                  name="healthFundName"
                  required
                  defaultValue=""
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">Select a fund…</option>
                  {HEALTH_FUNDS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="healthFundMemberNumber">
                  Member number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="healthFundMemberNumber"
                  name="healthFundMemberNumber"
                  required
                  placeholder="e.g. 1234567A"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="reasonForTreatment">
                  Reason for treatment <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="reasonForTreatment"
                  name="reasonForTreatment"
                  required
                  placeholder="e.g. lower back pain after long-distance running"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Per-visit consent. Health-fund claims capture a fresh drawn signature
          (embedded on the invoice PDF for HiCAPS audit); non-claim bookings
          use a quick consent tick-box instead. */}
      {claimActive ? (
        <div className="space-y-2 rounded-md border bg-card p-4">
          <Label>
            Client signature <span className="text-destructive">*</span>
          </Label>
          <SignaturePad onChange={setSignatureDataUrl} disabled={pending} />
          <p className="text-xs text-muted-foreground">
            By signing, the client confirms the information above and authorises
            us to submit a HICAPS claim on their behalf. A fresh signature is
            required for every health-fund visit.
          </p>
        </div>
      ) : (
        <div className="space-y-2 rounded-md border bg-card p-4">
          <Label>
            Consent to treatment <span className="text-destructive">*</span>
          </Label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="mt-1"
            />
            <span>The client consents to receiving treatment today.</span>
          </label>
          <p className="text-xs text-muted-foreground">
            Recorded as the client&rsquo;s consent for today&rsquo;s visit.
            {healthFundEligible
              ? " For a health-fund claim, tick the claim box above to capture a full signature instead."
              : ""}
          </p>
        </div>
      )}

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
