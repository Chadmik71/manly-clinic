"use client";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn, formatPrice, formatDuration } from "@/lib/utils";
import { SignaturePad } from "@/components/signature-pad";
import { BodyDiagram } from "@/components/body-diagram";
import {
  HEALTH_FUNDS,
  MEDICAL_HISTORY_GROUPS,
  GENDER_OPTIONS,
} from "@/lib/intake";
import { searchClients, getClientPrefill } from "./actions";

type Prefill = NonNullable<
  Awaited<ReturnType<typeof getClientPrefill>>["prefill"]
>;

type Service = {
  id: string;
  name: string;
  slug: string;
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
  const [clientId, setClientId] = useState("");
  // Pre-fill from the selected client's most recent intake + User
  // demographics. Fetched whenever a returning client is picked; the full
  // intake block uses prefillVersion as its key so a fresh fetch remounts
  // it with the new defaults rather than keeping stale values.
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [prefillVersion, setPrefillVersion] = useState(0);
  const [prefilling, setPrefilling] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  // Plain non-claim bookings record consent via this tick-box instead of a
  // drawn signature (faster for walk-ins).
  const [consentChecked, setConsentChecked] = useState(false);
  // Full clinical intake state (health-fund claim or pregnancy bookings).
  const [pregnantChecked, setPregnantChecked] = useState(false);
  const [history, setHistory] = useState<Set<string>>(new Set());
  const [painCodes, setPainCodes] = useState<string[]>([]);
  const [painScale, setPainScale] = useState<number | null>(null);

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
  // Pregnancy: the Pregnancy Massage service is always treated as pregnant;
  // for any other service, staff can tick "client is pregnant".
  const isPregnancyService = selectedService?.slug === "pregnancy-massage";
  const isPregnant = isPregnancyService || pregnantChecked;
  // Health-fund claims and pregnancy bookings need the full clinical intake
  // plus a fresh drawn signature; everything else uses the consent tick-box.
  const requireFullIntake = claimActive || isPregnant;
  // Auto-tick the claim checkbox whenever the selected service is
  // health-fund-eligible (Remedial Massage today) — customers booking
  // those services almost always do so *to* claim. Staff can still
  // untick if a particular client is paying cash this visit. Switching
  // to a non-eligible service auto-collapses the claim section via
  // claimActive above.
  useEffect(() => {
    setClaiming(healthFundEligible);
  }, [healthFundEligible]);

  // When a client is picked (or switched), pull their last intake + User
  // demographics so the full-intake block can pre-fill on mount. The
  // signature pad is deliberately NOT pre-filled — every visit needs a
  // fresh drawn signature per the per-visit consent rule. Walk-in mode
  // leaves clientId empty so this is a no-op there.
  useEffect(() => {
    if (!clientId) {
      setPrefill(null);
      return;
    }
    let cancelled = false;
    setPrefilling(true);
    (async () => {
      const res = await getClientPrefill(clientId);
      if (cancelled) return;
      setPrefilling(false);
      if (res.prefill) {
        setPrefill(res.prefill);
        // Push the controlled-state fields (Set / number / array) now so the
        // checkboxes, pain-scale buttons and body-diagram reflect the new
        // client immediately. The text fields are unmounted/remounted via
        // prefillVersion below.
        if (res.prefill.intake) {
          setHistory(new Set(res.prefill.intake.medicalHistory));
          setPainCodes(res.prefill.intake.painLocationCodes);
          setPainScale(res.prefill.intake.painScale);
          if (!isPregnancyService) {
            setPregnantChecked(res.prefill.intake.pregnancy);
          }
        } else {
          setHistory(new Set());
          setPainCodes([]);
          setPainScale(null);
        }
        setPrefillVersion((v) => v + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
    // isPregnancyService is intentionally NOT a dep — we only sync the
    // pregnant tick-box on a fresh client load, not when the service changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

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
    if (claimActive) fd.set("claimWithHealthFund", "on");
    else {
      fd.delete("claimWithHealthFund");
      fd.delete("healthFundName");
      fd.delete("healthFundMemberNumber");
      fd.delete("reasonForTreatment");
    }
    // Health-fund claims and pregnancy bookings need the full clinical intake
    // plus a fresh drawn signature; plain non-claim bookings record consent
    // via the tick-box. Validate client-side so staff don't dispatch a
    // half-filled booking.
    if (requireFullIntake) {
      if (!signatureDataUrl) {
        setError(
          claimActive
            ? "Please ask the client to sign to authorise the health fund claim."
            : "Please ask the client to sign to acknowledge the pregnancy-massage safety information.",
        );
        return;
      }
      fd.set("signatureDataUrl", signatureDataUrl);
      fd.delete("consentToTreat");
      if (isPregnant) fd.set("pregnancy", "on");
      else fd.delete("pregnancy");
      fd.set("medicalHistory", JSON.stringify([...history]));
      fd.set("painLocationCodes", JSON.stringify(painCodes));
      if (painScale != null) fd.set("painScale", String(painScale));
      else fd.delete("painScale");
    } else {
      if (!consentChecked) {
        setError("Please confirm the client consents to treatment.");
        return;
      }
      fd.set("consentToTreat", "on");
      // Defensive: drop any stale intake/signature fields if the staff member
      // toggled claim/pregnancy off after filling them in.
      fd.delete("signatureDataUrl");
      fd.delete("pregnancy");
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
        setPregnantChecked(false);
        setHistory(new Set());
        setPainCodes([]);
        setPainScale(null);
        setClientId("");
        setPrefill(null);
      }
    });
  }

  function toggleHistory(code: string, on: boolean) {
    setHistory((s) => {
      const next = new Set(s);
      if (on) next.add(code);
      else next.delete(code);
      return next;
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
          onClick={() => {
            setMode("walkin");
            // No client selected in walk-in mode — drop any cached prefill
            // so we don't ship stale defaults if staff switch back.
            setClientId("");
          }}
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
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
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

      {/* Pregnancy flag — the Pregnancy Massage service implies it (no need to
          ask); for any other service staff can tick it to trigger the full
          intake + safety acknowledgement. */}
      {!isPregnancyService && (
        <label className="flex items-start gap-2 text-sm rounded-md border bg-card p-4">
          <input
            type="checkbox"
            checked={pregnantChecked}
            onChange={(e) => setPregnantChecked(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Client is currently pregnant
            <span className="block text-xs text-muted-foreground">
              Requires a short safety intake + signature before booking.
            </span>
          </span>
        </label>
      )}

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
            <div key={`claim-${prefillVersion}`} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="healthFundName">
                  Health fund <span className="text-destructive">*</span>
                </Label>
                <select
                  id="healthFundName"
                  name="healthFundName"
                  required
                  defaultValue={prefill?.user.healthFundName ?? ""}
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
                  defaultValue={prefill?.user.healthFundMemberNumber ?? ""}
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
                  defaultValue={prefill?.intake?.reasonForTreatment ?? ""}
                  placeholder="e.g. lower back pain after long-distance running"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Full clinical intake — required for health-fund claims and pregnancy
          bookings. Mirrors the customer online intake. Hidden (and not
          submitted) for plain non-claim bookings. */}
      {requireFullIntake && (
        <div
          key={`intake-${prefillVersion}`}
          className="rounded-md border border-primary/30 bg-primary/[0.03] p-4 space-y-5"
        >
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Clinical intake</h2>
              {prefilling && (
                <span className="text-xs text-muted-foreground">
                  Loading client history…
                </span>
              )}
              {!prefilling && prefill?.intake && (
                <span className="text-xs text-emerald-700 dark:text-emerald-400">
                  Pre-filled from last visit · double-check before submitting
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {claimActive
                ? "Required for the health-fund record. Fields marked * are mandatory."
                : "Required for pregnancy safety screening. Fields marked * are mandatory."}
            </p>
          </div>

          {/* Patient details */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dob">Date of birth</Label>
              <Input
                id="dob"
                name="dob"
                type="date"
                defaultValue={prefill?.user.dob ?? ""}
              />
            </div>
            {isPregnancyService ? (
              <input type="hidden" name="gender" value="FEMALE" />
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="gender">Gender</Label>
                <select
                  id="gender"
                  name="gender"
                  defaultValue={prefill?.user.gender ?? ""}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">—</option>
                  {GENDER_OPTIONS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* GP (optional) */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="gpName">GP name (optional)</Label>
              <Input
                id="gpName"
                name="gpName"
                defaultValue={prefill?.user.gpName ?? ""}
                placeholder="Dr Jane Smith"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gpClinic">GP clinic (optional)</Label>
              <Input
                id="gpClinic"
                name="gpClinic"
                defaultValue={prefill?.user.gpClinic ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gpPhone">GP phone (optional)</Label>
              <Input
                id="gpPhone"
                name="gpPhone"
                type="tel"
                defaultValue={prefill?.user.gpPhone ?? ""}
              />
            </div>
          </div>

          {/* Medical history checklist */}
          <div className="space-y-3">
            <Label>Medical history — tick anything that applies</Label>
            {MEDICAL_HISTORY_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                  {group.label}
                </div>
                <div className="grid sm:grid-cols-2 gap-y-1.5 gap-x-4">
                  {group.items.map((it) => (
                    <label key={it.code} className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={history.has(it.code)}
                        onChange={(e) => toggleHistory(it.code, e.target.checked)}
                        className="mt-0.5"
                      />
                      <span>{it.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor="medicalConditions">
                Other conditions or detail{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="medicalConditions"
                name="medicalConditions"
                required
                defaultValue={prefill?.intake?.medicalConditions ?? ""}
                placeholder="Anything else we should know? Write 'none' if not applicable."
              />
            </div>
          </div>

          {/* Medications + allergies */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="medications">
                Current medications <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="medications"
                name="medications"
                required
                defaultValue={prefill?.intake?.medications ?? ""}
                placeholder="e.g. blood thinners. Write 'none' if none."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="allergies">
                Allergies <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="allergies"
                name="allergies"
                required
                defaultValue={prefill?.intake?.allergies ?? ""}
                placeholder="oils, latex, nuts… Write 'none' if none."
              />
            </div>
          </div>

          {/* Presenting complaint */}
          <div className="space-y-3">
            <Label>Areas of concern</Label>
            <BodyDiagram
              initialCodes={prefill?.intake?.painLocationCodes ?? []}
              onChange={setPainCodes}
            />
            <div className="space-y-2">
              <Label className="text-sm">
                Pain intensity (0 = none, 10 = worst)
              </Label>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: 11 }).map((_, n) => {
                  const active = painScale === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPainScale(active ? null : n)}
                      className={cn(
                        "h-9 w-9 rounded-md border text-sm tabular-nums transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground font-semibold"
                          : "hover:bg-accent",
                      )}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="painOnset">When did it start?</Label>
                <Input
                  id="painOnset"
                  name="painOnset"
                  defaultValue={prefill?.intake?.painOnset ?? ""}
                  placeholder="e.g. 2 weeks ago, after a fall"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="injuries">
                  Recent injuries / areas to avoid{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="injuries"
                  name="injuries"
                  required
                  defaultValue={prefill?.intake?.injuries ?? ""}
                  placeholder="recent surgery, sprains, scars to avoid. 'none' if none."
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="painHistory">
                  Aggravating / relieving factors &amp; previous treatment
                </Label>
                <Textarea
                  id="painHistory"
                  name="painHistory"
                  defaultValue={prefill?.intake?.painHistory ?? ""}
                  placeholder="What makes it worse / better? Seen a GP, physio, chiro?"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="treatmentGoals">Goals for this session</Label>
                <Textarea
                  id="treatmentGoals"
                  name="treatmentGoals"
                  defaultValue={prefill?.intake?.treatmentGoals ?? ""}
                  placeholder="e.g. reduce lower back pain, improve mobility"
                />
              </div>
            </div>
          </div>

          {/* Pregnancy weeks */}
          {isPregnant && (
            <div className="space-y-1.5 max-w-xs">
              <Label htmlFor="pregnancyWeeks">
                Weeks pregnant <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pregnancyWeeks"
                name="pregnancyWeeks"
                type="number"
                min={1}
                max={45}
                required
                defaultValue={prefill?.intake?.pregnancyWeeks ?? ""}
                placeholder="e.g. 24"
              />
              <p className="text-xs text-muted-foreground">
                Pregnancy massage is generally suitable from ~13 weeks with
                obstetrician clearance.
              </p>
            </div>
          )}

          {/* Emergency contact */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="emergencyContactName">
                Emergency contact name{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="emergencyContactName"
                name="emergencyContactName"
                required
                defaultValue={prefill?.intake?.emergencyContactName ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emergencyContactRelationship">
                Relationship
              </Label>
              <Input
                id="emergencyContactRelationship"
                name="emergencyContactRelationship"
                defaultValue={
                  prefill?.intake?.emergencyContactRelationship ?? ""
                }
                placeholder="e.g. partner, parent"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="emergencyContactPhone">
                Emergency contact phone{" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="emergencyContactPhone"
                name="emergencyContactPhone"
                type="tel"
                required
                defaultValue={prefill?.intake?.emergencyContactPhone ?? ""}
              />
            </div>
          </div>
        </div>
      )}

      {/* Per-visit consent. Health-fund claims and pregnancy bookings capture a
          fresh drawn signature (HiCAPS audit / pregnancy safety ack); plain
          non-claim bookings use a quick consent tick-box instead. */}
      {requireFullIntake ? (
        <div className="space-y-2 rounded-md border bg-card p-4">
          <Label>
            Client signature <span className="text-destructive">*</span>
          </Label>
          <SignaturePad onChange={setSignatureDataUrl} disabled={pending} />
          <p className="text-xs text-muted-foreground">
            {claimActive
              ? "By signing, the client confirms the information above and authorises us to submit a HICAPS claim on their behalf. A fresh signature is required for every health-fund visit."
              : "By signing, the client confirms the clinical information above is accurate and acknowledges the pregnancy-massage safety information."}
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
