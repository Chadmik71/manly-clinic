"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SignaturePad } from "@/components/signature-pad";
import { BodyDiagram } from "@/components/body-diagram";
import {
  MEDICAL_HISTORY_GROUPS,
  GENDER_OPTIONS,
  HEALTH_FUNDS,
} from "@/lib/intake";
import { DepositCard } from "./deposit-card";
import { previewVoucher } from "./actions";
import { formatPrice } from "@/lib/utils";

// Build-time kill switch: when false, the deposit UI is hidden globally even
// if the admin enables it via the settings UI. The runtime DB flag passed in
// as a prop is AND-ed with this — both must be true to require a deposit.
const DEPOSITS_ENV_ENABLED = process.env.NEXT_PUBLIC_DEPOSITS_ENABLED === "true";

type IntakeDefaults = {
  medicalConditions: string;
  medications: string;
  allergies: string;
  injuries: string;
  medicalHistory: string[];
  painLocation: string;
  painScale: number | null;
  painOnset: string;
  painHistory: string;
  treatmentGoals: string;
  pregnancy: boolean;
  pregnancyWeeks: number | null;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  healthFundName: string;
  healthFundMemberNumber: string;
  reasonForTreatment: string;
  painLocationCodes: string[];
} | null;

type UserDefaults = {
  dob: string; // ISO yyyy-MM-dd or ""
  gender: string;
  addressLine1: string;
  suburb: string;
  stateRegion: string;
  postcode: string;
  gpName: string;
  gpClinic: string;
  gpPhone: string;
  healthFundName: string;
  healthFundMemberNumber: string;
};

function SectionHeader({
  step,
  title,
  desc,
}: {
  step: string;
  title: string;
  desc?: string;
}) {
  return (
    <CardHeader className="border-b">
      <div className="flex items-center gap-3">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary text-xs font-semibold tabular-nums">
          {step}
        </span>
        <CardTitle className="text-lg">{title}</CardTitle>
      </div>
      {desc && <CardDescription className="ml-10">{desc}</CardDescription>}
    </CardHeader>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 pt-4">{children}</div>
  );
}

export function ConfirmForm({
  action,
  serviceId,
  variantId,
  startsIso,
  serviceHealthFundEligible,
  serviceSlug,
  intakeDefaults,
  userDefaults,
  isGuest,
  signedInEmail,
  partnerVariantId,
  partnerVariantSummary,
  bookingSummary,
  depositsEnabled,
}: {
  action: (
    formData: FormData,
  ) => Promise<{ ok?: boolean; error?: string; reference?: string }>;
  serviceId: string;
  variantId: string;
  startsIso: string;
  serviceHealthFundEligible: boolean;
  serviceSlug?: string;
  intakeDefaults: IntakeDefaults;
  userDefaults: UserDefaults;
  isGuest: boolean;
  signedInEmail: string | null;
  /** Set when this booking is the primary half of a couple booking. */
  partnerVariantId?: string | null;
  /** Optional human-readable partner-side summary, e.g. "Deep Tissue — 60 min ($120)". */
  partnerVariantSummary?: string | null;
  /** Display strings shown in the "Confirm your booking?" modal. */
  bookingSummary: {
    serviceName: string;
    durationLabel: string;
    priceLabel: string;
    /** Treatment-only price in cents. Passed to previewVoucher so the Apply
     *  button can show "$X off" before the customer submits. */
    priceCents: number;
    dateLabel: string;
    timeLabel: string;
    partnerLabel: string | null;
  };
  /** Runtime DB-backed setting from ClinicSetting. When false, the booking
   *  flow bypasses the deposit step entirely. */
  depositsEnabled: boolean;
}) {
  // Effective deposit-required flag: env kill switch AND admin's runtime
  // toggle must both be on for the booking to require a deposit.
  const depositsActive = DEPOSITS_ENV_ENABLED && depositsEnabled;
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Close the confirm-booking modal on Escape so keyboard users have an
  // explicit dismiss without enabling backdrop-click (too easy to dismiss
  // accidentally on mobile, especially during signature capture nearby).
  useEffect(() => {
    if (!confirmOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setConfirmOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirmOpen, pending]);
  const [guestSuccess, setGuestSuccess] = useState<{
    reference: string;
  } | null>(null);
  const [pregnant, setPregnant] = useState<boolean>(
    intakeDefaults?.pregnancy ?? false,
  );
  // Pre-tick the claim checkbox for health-fund-eligible services
  // (currently Remedial Massage). Customers almost always pick those
  // services *to* claim — default-on saves a click. They can still
  // untick if paying cash this visit.
  const [claiming, setClaiming] = useState<boolean>(serviceHealthFundEligible);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  // Signature is captured only for two flows:
  //  - Remedial + health-fund claim (HICAPS audit trail)
  //  - Pregnancy massage (clinical-safety acknowledgement)
  // Other services skip the signature pad — even if "claim with health
  // fund" gets ticked on a non-Remedial eligible service.
  const isPregnancyMassage = serviceSlug === 'pregnancy-massage';
  const isRemedialClaim = claiming && serviceSlug === 'remedial-massage';
  const signatureRequired = isRemedialClaim || isPregnancyMassage;
  // Default-collapsed optional sections. The safety-floor textareas stay
  // mounted under a `hidden` wrapper so pre-filled allergies/injuries
  // still submit even if the customer never expands the card.
  const [safetyFloorOpen, setSafetyFloorOpen] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  // Body-diagram selection. Pre-fills from the most recent intake so
  // returning customers do not have to re-mark unchanged areas.
  const [painCodes, setPainCodes] = useState<string[]>(
    intakeDefaults?.painLocationCodes ?? [],
  );
  const [pain, setPain] = useState<number | null>(
    intakeDefaults?.painScale ?? null,
  );
  const [history, setHistory] = useState<Set<string>>(
    new Set(intakeDefaults?.medicalHistory ?? []),
  );
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [depositAmountCents, setDepositAmountCents] = useState(3000);
  const [depositBaseCents, setDepositBaseCents] = useState<number | undefined>(undefined);
  const [depositSurchargeCents, setDepositSurchargeCents] = useState<number | undefined>(undefined);
  const [depositSurchargeBps, setDepositSurchargeBps] = useState<number | undefined>(undefined);
  const [paymentStage, setPaymentStage] = useState<"idle" | "fetching" | "card" | "paying">("idle");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [voucherCode, setVoucherCode] = useState("");
  const [voucherChecking, setVoucherChecking] = useState(false);
  const [voucherResult, setVoucherResult] = useState<
    | { ok: true; appliedCents: number; balanceCents: number; amountCents: number; code: string }
    | { ok: false; error: string }
    | null
  >(null);

  async function onApplyVoucher() {
    if (!voucherCode.trim()) return;
    setVoucherChecking(true);
    setVoucherResult(null);
    try {
      const res = await previewVoucher(voucherCode, bookingSummary.priceCents);
      if (res.ok) {
        setVoucherResult({ ...res, code: voucherCode.trim().toUpperCase() });
      } else {
        setVoucherResult(res);
      }
    } finally {
      setVoucherChecking(false);
    }
  }

  function clearVoucher() {
    setVoucherCode("");
    setVoucherResult(null);
  }

  const intakeRequired = claiming;

  function toggleHistory(code: string, on: boolean) {
    setHistory((s) => {
      const next = new Set(s);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });
  }

  async function fetchPaymentIntent() {
    setPaymentStage("fetching");
    setPaymentError(null);
    try {
      const f = new FormData(formRef.current!);
      const resp = await fetch("/api/bookings/payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: String(f.get("email") ?? ""),
          name: String(f.get("name") ?? ""),
        }),
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        setPaymentStage("idle");
        setPaymentError(j.error ?? "Payment unavailable (HTTP " + resp.status + ")");
        return;
      }
      const data = await resp.json();
      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
      setDepositAmountCents(data.amountCents);
      setDepositBaseCents(
        typeof data.baseDepositCents === "number" ? data.baseDepositCents : undefined,
      );
      setDepositSurchargeCents(
        typeof data.surchargeCents === "number" ? data.surchargeCents : undefined,
      );
      setDepositSurchargeBps(
        typeof data.surchargeBps === "number" ? data.surchargeBps : undefined,
      );
      setPaymentStage("card");
    } catch {
      setPaymentStage("idle");
      setPaymentError("Could not contact payment server. Please try again.");
    }
  }

  function handlePaymentSuccess(piId: string) {
    setPaymentStage("paying");
    setPaymentIntentId(piId);
    formRef.current?.requestSubmit();
  }

  function handlePaymentError(message: string) {
    setPaymentError(message);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (depositsActive && !paymentIntentId && paymentStage !== "paying") {
      fetchPaymentIntent();
      return;
    }
    const fd = new FormData(e.currentTarget);
    fd.set("serviceId", serviceId);
    fd.set("variantId", variantId);
    fd.set("startsIso", startsIso);
    fd.set("medicalHistory", JSON.stringify([...history]));
    fd.set("painLocationCodes", JSON.stringify(painCodes));
    if (pain != null) fd.set("painScale", String(pain));
    // Signature gate: remedial+HF claim (HICAPS audit) or pregnancy (safety ack).
    if (signatureRequired) {
      if (!signatureDataUrl) {
        setError(
          isRemedialClaim
            ? "Please sign in the signature pad to authorise the health fund claim."
            : "Please sign in the signature pad to acknowledge the pregnancy-massage safety information.",
        );
        return;
      }
      fd.set("signatureDataUrl", signatureDataUrl);
    }
    start(async () => {
      if (paymentIntentId) fd.set("paymentIntentId", paymentIntentId);
      const res = await action(fd);
      if (res?.error) setError(res.error);
      else if (res?.reference) {
        if (isGuest) {
          setGuestSuccess({ reference: res.reference });
          window.scrollTo({ top: 0, behavior: "smooth" });
          setConfirmOpen(false);
        } else {
          window.location.href = `/portal/bookings/confirmed?ref=${res.reference}`;
        }
      }
    });
  }

  // Step number offset: when guest, the 11 numbered sections become 1..11 too
  // (the guest contact section is rendered as "Step 1" and the rest shift up
  // by 1). When signed in, the original 1..10/11 numbering is preserved.
  let _stepCounter = 0;
  const stepNo = (_n: number) => String(++_stepCounter);
  const lastClinicalStep = serviceHealthFundEligible ? 11 : 10;

  // Three-tier intake based on service type:
  //  - 'full'      → Remedial (the only health-fund-eligible service): full clinical intake
  //  - 'pregnancy' → Pregnancy massage: pregnancy weeks + safety floor only
  //  - 'safety'    → All other services: allergies + injuries (optional)
  type IntakeMode = 'full' | 'pregnancy' | 'safety';
  const intakeMode: IntakeMode = serviceHealthFundEligible
    ? 'full'
    : serviceSlug === 'pregnancy-massage'
      ? 'pregnancy'
      : 'safety';

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-5">
      {depositsActive && !guestSuccess && (
        <div className="rounded-md border border-primary/20 bg-primary/5 px-4 py-3 text-sm">
          <span className="font-medium">$30 deposit required to confirm booking</span> — refundable if you cancel with at least 1 hour notice per our cancellation policy.
        </div>
      )}
      {guestSuccess && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardHeader>
            <CardTitle className="text-emerald-700 dark:text-emerald-400">
              Booking confirmed 🎉
            </CardTitle>
            <CardDescription>
              Reference{" "}
              <code className="font-mono">{guestSuccess.reference}</code> — a
              confirmation email is on its way. We&apos;ve also linked this
              booking to your customer record.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>
              Want to manage your bookings online next time? Set a password
              for your account:
            </p>
            <p>
              <a
                href="/forgot-password"
                className="text-primary font-medium hover:underline"
              >
                Set a password →
              </a>
            </p>
          </CardContent>
        </Card>
      )}
      {/* 0. Your contact details (guest only) */}
      {isGuest && (
        <Card>
          <SectionHeader
            step={stepNo(0)}
            title="Your contact details"
            desc="So we can find your record (or create one) and send you the booking confirmation."
          />
          <CardContent className="pb-5">
            <FieldGrid>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="guestName">Full name</Label>
                <Input
                  id="guestName"
                  name="guestName"
                  required
                  autoComplete="name"
                  placeholder="Jane Doe"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guestEmail">Email</Label>
                <Input
                  id="guestEmail"
                  name="guestEmail"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="jane@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guestPhone">Mobile</Label>
                <Input
                  id="guestPhone"
                  name="guestPhone"
                  type="tel"
                  required
                  autoComplete="tel"
                  placeholder="0412 345 678"
                />
              </div>
            </FieldGrid>
            <p className="text-xs text-muted-foreground mt-3">
              If we already have a record matching this email or mobile,
              we&apos;ll attach this booking to it — no duplicates. You can set
              a password later via the &ldquo;Forgot password&rdquo; link on
              sign-in.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 1. Patient details (hidden for relaxation / safety services) */}
      {intakeMode !== "safety" && (<Card>
        <SectionHeader
          step={stepNo(1)}
          title="Patient details"
          desc="Required for your clinical record. Only changes are saved."
        />
        <CardContent className="pb-5">
          <FieldGrid>
            <div className="space-y-1.5">
              <Label htmlFor="dob">Date of birth</Label>
              <Input
                id="dob"
                name="dob"
                type="date"
                defaultValue={userDefaults.dob}
              />
            </div>
            {isPregnancyMassage ? (
              // Pregnancy massage is women-only; skip the gender selector and
              // submit FEMALE silently so the User record still gets a value.
              <input type="hidden" name="gender" value="FEMALE" />
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="gender">Gender</Label>
                <select
                  id="gender"
                  name="gender"
                  defaultValue={userDefaults.gender}
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
          </FieldGrid>
        </CardContent>
      </Card>)}

      {/* 2. GP / referring doctor (hidden for relaxation / safety services) */}
      {intakeMode !== "safety" && (<Card>
        <SectionHeader
          step={stepNo(2)}
          title="General Practitioner (optional)"
          desc="In case we need to communicate with your GP about treatment."
        />
        <CardContent className="pb-5">
          <FieldGrid>
            <div className="space-y-1.5">
              <Label htmlFor="gpName">GP name</Label>
              <Input
                id="gpName"
                name="gpName"
                defaultValue={userDefaults.gpName}
                placeholder="Dr Jane Smith"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gpClinic">Clinic</Label>
              <Input
                id="gpClinic"
                name="gpClinic"
                defaultValue={userDefaults.gpClinic}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="gpPhone">Clinic phone</Label>
              <Input
                id="gpPhone"
                name="gpPhone"
                type="tel"
                defaultValue={userDefaults.gpPhone}
              />
            </div>
          </FieldGrid>
        </CardContent>
      </Card>)}

      {/* Returning customer banner — only when we have prior intake data
          to pre-fill from. Tells the customer the sections below are
          already filled in from their last visit, and offers a quick
          jump to the consent + signature step. Cards below still show
          and are fully editable; this just lowers friction for the
          "nothing has changed" case which is the common one. */}
      {intakeDefaults && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="py-4 space-y-2">
            <p className="text-sm font-medium">Welcome back.</p>
            <p className="text-sm text-muted-foreground">
              Your details are pre-filled below from your last visit. Scroll
              through to review and edit only what&rsquo;s changed today. If
              everything&rsquo;s the same, jump straight to signing.
            </p>
            <div className="pt-1">
              <Button asChild type="button" variant="outline" size="sm">
                <a href="#consent-and-sign">
                  Looks good &mdash; skip to signing
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Medical history checklist (full intake only) */}
      {intakeMode === 'full' && (
      <Card>
        <SectionHeader
          step={stepNo(3)}
          title="Medical history"
          desc="Tick anything that applies — current or past. Helps us treat you safely."
        />
        <CardContent className="pb-5 pt-4 space-y-5">
          {MEDICAL_HISTORY_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                {group.label}
              </div>
              <div className="grid sm:grid-cols-2 gap-y-2 gap-x-4">
                {group.items.map((it) => (
                  <label
                    key={it.code}
                    className="flex items-start gap-2 text-sm"
                  >
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
          <div className="space-y-1.5 pt-2">
            <Label htmlFor="medicalConditions">
              Other conditions or detail
              {intakeRequired && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Textarea
              id="medicalConditions"
              name="medicalConditions"
              required={intakeRequired}
              defaultValue={intakeDefaults?.medicalConditions ?? ""}
              placeholder="Anything else we should know? Write 'none' if not applicable."
            />
          </div>
        </CardContent>
      </Card>
      )}

      {/* 4. Medications + allergies (full intake only) */}
      {intakeMode === 'full' && (
      <Card>
        <SectionHeader step={stepNo(4)} title="Medications &amp; allergies" />
        <CardContent className="pb-5">
          <FieldGrid>
            <div className="space-y-1.5">
              <Label htmlFor="medications">
                Current medications
                {intakeRequired && <span className="text-destructive ml-1">*</span>}
              </Label>
              <Textarea
                id="medications"
                name="medications"
                required={intakeRequired}
                defaultValue={intakeDefaults?.medications ?? ""}
                placeholder="e.g. blood thinners, paracetamol. Write 'none' if none."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="allergies">
                Allergies
                {intakeRequired && <span className="text-destructive ml-1">*</span>}
              </Label>
              <Textarea
                id="allergies"
                name="allergies"
                required={intakeRequired}
                defaultValue={intakeDefaults?.allergies ?? ""}
                placeholder="oils, latex, nuts… Write 'none' if none."
              />
            </div>
          </FieldGrid>
        </CardContent>
      </Card>
      )}

      {/* 5. Presenting complaint (full intake only) */}
      {intakeMode === 'full' && (
      <Card>
        <SectionHeader
          step={stepNo(5)}
          title="Which areas should we focus on?"
          desc="Mark the areas of concern on the diagram and add any details below."
        />
        <CardContent className="pb-5">
          {/* Visual body-diagram zone selector. Returning customers see */}
          {/* their previous selection pre-loaded; tap a marker to add or */}
          {/* remove a focus area. */}
          <div className="pt-3 pb-4">
            <BodyDiagram
              initialCodes={intakeDefaults?.painLocationCodes ?? []}
              onChange={setPainCodes}
            />
          </div>
          <FieldGrid>
            <div className="space-y-2 sm:col-span-2">
              <Label>Pain intensity (0 = none, 10 = worst imaginable)</Label>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: 11 }).map((_, n) => {
                  const active = pain === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPain(active ? null : n)}
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
            <div className="space-y-1.5">
              <Label htmlFor="painOnset">When did it start?</Label>
              <Input
                id="painOnset"
                name="painOnset"
                defaultValue={intakeDefaults?.painOnset ?? ""}
                placeholder="e.g. 2 weeks ago, after a fall"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="injuries">Recent injuries / areas to avoid {intakeRequired && <span className="text-destructive ml-1">*</span>}</Label>
              <Input
                id="injuries"
                name="injuries"
                required={intakeRequired}
                defaultValue={intakeDefaults?.injuries ?? ""}
                placeholder="recent surgery, sprains, scars to avoid"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="painHistory">
                Aggravating / relieving factors &amp; previous treatment
              </Label>
              <Textarea
                id="painHistory"
                name="painHistory"
                defaultValue={intakeDefaults?.painHistory ?? ""}
                placeholder="What makes it worse / better? Have you seen a GP, physio, chiro, etc.?"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="treatmentGoals">Your goals from this session</Label>
              <Textarea
                id="treatmentGoals"
                name="treatmentGoals"
                defaultValue={intakeDefaults?.treatmentGoals ?? ""}
                placeholder="e.g. reduce lower back pain, improve mobility, full-body relaxation"
              />
            </div>
          </FieldGrid>
        </CardContent>
      </Card>
      )}

      {/* SAFETY FLOOR — allergies + injuries (relaxation/pregnancy modes).
          Default-collapsed; the textareas are kept in the DOM (CSS-hidden)
          so pre-filled values still submit even when the card is closed. */}
      {intakeMode !== 'full' && (
        <Card>
          <CardContent className="py-4 space-y-3">
            {!safetyFloorOpen ? (
              <button
                type="button"
                onClick={() => setSafetyFloorOpen(true)}
                className="w-full text-left flex items-start justify-between gap-3 rounded-md p-1 -m-1 hover:bg-accent/40"
              >
                <div className="space-y-1">
                  <p className="text-sm font-medium">Anything we should know?</p>
                  {intakeDefaults?.allergies || intakeDefaults?.injuries ? (
                    <p className="text-xs text-muted-foreground">
                      On file:{" "}
                      {intakeDefaults?.allergies
                        ? `allergies — ${intakeDefaults.allergies}`
                        : "allergies — none"}
                      {" · "}
                      {intakeDefaults?.injuries
                        ? `injuries — ${intakeDefaults.injuries}`
                        : "injuries — none"}
                      . Tap to edit.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Optional — allergies, recent injuries, areas to avoid.
                    </p>
                  )}
                </div>
                <span className="text-primary text-sm shrink-0">+ Edit</span>
              </button>
            ) : (
              <p className="text-sm font-medium">Anything we should know?</p>
            )}
            <div className={safetyFloorOpen ? "" : "hidden"}>
              <FieldGrid>
                <div className="space-y-1.5">
                  <Label htmlFor="allergies">Allergies</Label>
                  <Textarea
                    id="allergies"
                    name="allergies"
                    defaultValue={intakeDefaults?.allergies ?? ""}
                    placeholder="oils, latex, nuts… Leave blank if none."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="injuries">Recent injuries / areas to avoid</Label>
                  <Textarea
                    id="injuries"
                    name="injuries"
                    defaultValue={intakeDefaults?.injuries ?? ""}
                    placeholder="recent surgery, sprains, scars to avoid. Leave blank if none."
                  />
                </div>
              </FieldGrid>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 6. Pregnancy (full intake AND pregnancy massage; hidden for relaxation services).
          For pregnancy massage the "are you pregnant?" checkbox is redundant —
          we skip it and ask only for weeks. */}
      {intakeMode !== 'safety' && (
      <Card>
        <SectionHeader step={stepNo(6)} title="Pregnancy" />
        <CardContent className="pb-5 pt-4 space-y-3">
          {isPregnancyMassage ? (
            <input type="hidden" name="pregnancy" value="on" />
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="pregnancy"
                checked={pregnant}
                onChange={(e) => setPregnant(e.target.checked)}
              />
              <span>I am currently pregnant</span>
            </label>
          )}
          {(pregnant || isPregnancyMassage) && (
            <div className={isPregnancyMassage ? "max-w-xs space-y-1" : "ml-6 max-w-xs space-y-1"}>
              <Label htmlFor="pregnancyWeeks" className="text-sm">
                How many weeks?
              </Label>
              <Input
                id="pregnancyWeeks"
                name="pregnancyWeeks"
                type="number"
                min={1}
                max={45}
                required
                defaultValue={intakeDefaults?.pregnancyWeeks ?? ""}
                placeholder="e.g. 24"
              />
              <p className="text-xs text-muted-foreground">
                Pregnancy massage is generally suitable from the second
                trimester (~13 weeks) with obstetrician clearance.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* 7. Emergency contact (full intake only) */}
      {intakeMode === 'full' && (
      <Card>
        <SectionHeader step={stepNo(7)} title="Emergency contact" />
        <CardContent className="pb-5">
          <FieldGrid>
            <div className="space-y-1.5">
              <Label htmlFor="emergencyContactName">
                Name
                {intakeRequired && <span className="text-destructive ml-1">*</span>}
              </Label>
              <Input
                id="emergencyContactName"
                name="emergencyContactName"
                required={intakeRequired}
                defaultValue={intakeDefaults?.emergencyContactName ?? ""}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="emergencyContactRelationship">Relationship</Label>
              <Input
                id="emergencyContactRelationship"
                name="emergencyContactRelationship"
                defaultValue={intakeDefaults?.emergencyContactRelationship ?? ""}
                placeholder="e.g. partner, parent"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="emergencyContactPhone">
                Phone
                {intakeRequired && <span className="text-destructive ml-1">*</span>}
              </Label>
              <Input
                id="emergencyContactPhone"
                name="emergencyContactPhone"
                type="tel"
                required={intakeRequired}
                defaultValue={intakeDefaults?.emergencyContactPhone ?? ""}
              />
            </div>
          </FieldGrid>
        </CardContent>
      </Card>
      )}

      {/* 8. Health fund (optional) */}
      {serviceHealthFundEligible && (
        <Card>
          <SectionHeader step={stepNo(8)} title="Health fund / private insurance" />
          <CardContent className="pb-5 pt-4 space-y-3">
            <Badge variant="success" className="w-fit">
              This treatment is health-fund rebatable
            </Badge>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="claimWithHealthFund"
                checked={claiming}
                onChange={(e) => setClaiming(e.target.checked)}
                className="mt-1"
              />
              <span>
                I&apos;ll be claiming this session with my health fund or
                private health insurance.
              </span>
            </label>
            {claiming && (
              <div className="rounded-md border bg-accent/40 p-3 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Your treatment record must include accurate clinical
                  information — fields marked with * are required.
                </p>
                <FieldGrid>
                  <div className="space-y-1.5">
                    <Label htmlFor="healthFundName">
                      Health fund <span className="text-destructive">*</span>
                    </Label>
                    <select
                      id="healthFundName"
                      name="healthFundName"
                      required
                      defaultValue={
                        userDefaults.healthFundName ||
                        intakeDefaults?.healthFundName ||
                        ""
                      }
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
                      defaultValue={
                        userDefaults.healthFundMemberNumber ||
                        intakeDefaults?.healthFundMemberNumber ||
                        ""
                      }
                      placeholder="e.g. 1234567A"
                    />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="reasonForTreatment">
                      Reason for treatment{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="reasonForTreatment"
                      name="reasonForTreatment"
                      required
                      defaultValue={intakeDefaults?.reasonForTreatment ?? ""}
                      placeholder="e.g. lower back pain after long-distance running"
                    />
                  </div>
                </FieldGrid>
                <p className="text-xs text-muted-foreground">
                  Bring your physical or digital health-fund card on the day so
                  we can process the rebate via HICAPS.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 9 (or 8). Voucher — default-collapsed. Auto-expands once the
          customer has applied a voucher (success or error result) so the
          status stays visible. */}
      <Card>
        {!voucherOpen && !voucherResult ? (
          <CardContent className="py-4">
            <button
              type="button"
              onClick={() => setVoucherOpen(true)}
              className="w-full text-left flex items-center justify-between gap-3 rounded-md p-1 -m-1 hover:bg-accent/40"
            >
              <span className="text-sm font-medium">
                Have a gift voucher?
              </span>
              <span className="text-primary text-sm">+ Add voucher</span>
            </button>
          </CardContent>
        ) : (
          <>
        <SectionHeader
          step={stepNo(serviceHealthFundEligible ? 9 : 8)}
          title="Gift voucher (optional)"
          desc="Got a code? We'll deduct the balance, up to the session price."
        />
        <CardContent className="pb-5 pt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              name="voucherCode"
              value={voucherCode}
              onChange={(e) => {
                setVoucherCode(e.target.value);
                // Stale result if the user edits after applying — force a re-apply.
                if (voucherResult) setVoucherResult(null);
              }}
              placeholder="GV-XXXX-XXXX"
              className="max-w-xs uppercase font-mono"
              disabled={pending}
            />
            {voucherResult && voucherResult.ok ? (
              <Button
                type="button"
                variant="outline"
                onClick={clearVoucher}
                disabled={pending}
              >
                Remove
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={onApplyVoucher}
                disabled={pending || voucherChecking || !voucherCode.trim()}
              >
                {voucherChecking ? "Checking…" : "Apply"}
              </Button>
            )}
          </div>
          {voucherResult && !voucherResult.ok && (
            <p className="text-sm text-destructive">{voucherResult.error}</p>
          )}
          {voucherResult && voucherResult.ok && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm">
              <span className="font-medium text-emerald-700 dark:text-emerald-300">
                Voucher applied:
              </span>{" "}
              <span className="font-semibold">
                {formatPrice(voucherResult.appliedCents)}
              </span>{" "}
              off the {formatPrice(bookingSummary.priceCents)} treatment.
              {voucherResult.balanceCents > voucherResult.appliedCents && (
                <>
                  {" "}
                  Remaining balance after this booking:{" "}
                  {formatPrice(voucherResult.balanceCents - voucherResult.appliedCents)}.
                </>
              )}
            </div>
          )}
        </CardContent>
          </>
        )}
      </Card>

      {partnerVariantId && (
        <Card>
          <SectionHeader
            step="❤"
            title="Partner’s details (couple booking)"
            desc={
              partnerVariantSummary
                ? `Partner is booked for: ${partnerVariantSummary}`
                : "Partner booked alongside the primary booking."
            }
          />
          <CardContent className="pb-5 pt-4 space-y-1.5">
            <Label htmlFor="partnerName">Partner’s name <span className="text-destructive">*</span></Label>
            <Input
              id="partnerName"
              name="partnerName"
              required
              maxLength={120}
              placeholder="Partner’s full name"
            />
          </CardContent>
        </Card>
      )}

      {/* 10 (or 9). Notes — default-collapsed; the textarea is left in
          the DOM (CSS-hidden) so anything typed before a re-collapse is
          still submitted. */}
      <Card>
        {!notesOpen ? (
          <CardContent className="py-4">
            <button
              type="button"
              onClick={() => setNotesOpen(true)}
              className="w-full text-left flex items-center justify-between gap-3 rounded-md p-1 -m-1 hover:bg-accent/40"
            >
              <span className="text-sm font-medium">
                Anything else for the therapist?
              </span>
              <span className="text-primary text-sm">+ Add notes</span>
            </button>
          </CardContent>
        ) : (
          <>
            <SectionHeader
              step={stepNo(serviceHealthFundEligible ? 10 : 9)}
              title="Notes for your therapist (optional)"
            />
            <CardContent className="pb-5 pt-4">
              <Textarea
                name="notes"
                placeholder="Pressure preferences, focus areas, music/quiet preferences, etc."
              />
            </CardContent>
          </>
        )}
      </Card>

      {/* 11 (or 10). Consent */}
      <Card id="consent-and-sign">
        <SectionHeader
          step={stepNo(lastClinicalStep)}
          title="Consent"
          desc="Required by the Privacy Act 1988 (Cth) — Australian Privacy Principles 3 &amp; 5."
        />
        <CardContent className="pb-5 pt-4 space-y-3 text-sm">
          {/* APP 5 collection notice — what we collect, why, who sees
              it, what happens if not provided. Sits ABOVE the consent
              checkboxes so the customer reads the purpose before
              ticking. */}
          <div className="rounded-md border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground leading-relaxed">
            <span className="font-medium text-foreground">How we use this information.</span>{" "}
            We collect your name, contact details, health information and any
            health-fund details only to provide your treatment safely and,
            when you tick the claim option, to submit a HiCAPS rebate to your
            fund. Without it we can&rsquo;t safely treat you or claim on your
            behalf. Records stay with this clinic on Australian infrastructure
            and are not shared with anyone except your health fund for that
            specific claim. See our{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-foreground"
            >
              Privacy Policy
            </a>{" "}
            for how to access, correct, or delete your information.
          </div>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="consentToTreat"
              required
              className="mt-1"
            />
            <span>
              I consent to receiving the treatment described and confirm the
              health information above is accurate to the best of my knowledge.
            </span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="consentToStore"
              required
              className="mt-1"
            />
            <span>
              I consent to the secure storage of my health information for the
              purpose of safe and continuing treatment.
            </span>
          </label>
        </CardContent>
      </Card>

      {/* Signature — required only for remedial+HF claim or pregnancy. */}
      {signatureRequired && (
        <Card>
          <SectionHeader
            step="✍"
            title={
              isRemedialClaim
                ? "Sign to authorise health fund claim"
                : "Sign to acknowledge pregnancy-massage safety"
            }
            desc={
              isRemedialClaim
                ? "Required for every visit where you claim a rebate. A fresh signature is needed each visit — your previous health information is already filled in above."
                : "Required for every pregnancy-massage booking. By signing, you confirm you've read the safety information above and that the clinical details are accurate."
            }
          />
          <CardContent className="pb-5 pt-4 space-y-3">
            <SignaturePad onChange={setSignatureDataUrl} disabled={pending} />
            <p className="text-xs text-muted-foreground">
              {isRemedialClaim
                ? "By signing, you confirm the clinical information above is accurate as of today and authorise us to submit a HICAPS claim on your behalf."
                : "By signing, you confirm the clinical information above is accurate as of today."}
            </p>
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-3 justify-end">
        <Button
          type="button"
          size="lg"
          disabled={pending}
          onClick={() => {
            // HTML5 validation runs against required fields before we open
            // the dialog. If it fails, the browser surfaces the error and
            // the dialog stays closed.
            if (formRef.current && !formRef.current.reportValidity()) return;
            setError(null);
            if (depositsActive && !paymentIntentId && paymentStage === "idle") {
              fetchPaymentIntent();
            }
            setConfirmOpen(true);
          }}
        >
          {pending ? "Booking…" : "Confirm booking"}
        </Button>
      </div>

      {/* Suppress unused-prop warning if signedInEmail not displayed elsewhere */}
      <input
        type="hidden"
        name="partnerVariantId"
        value={partnerVariantId ?? ""}
      />
      <input type="hidden" name="_signedInEmail" value={signedInEmail ?? ""} />

      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-booking-title"
        >
          <div className="bg-background rounded-lg max-w-md w-full shadow-xl border max-h-[90vh] flex flex-col">
            {/* Header — always visible. The X gives a way out once the Stripe
                card form pushes the bottom Cancel button below the viewport
                fold (the bug that prompted this layout). */}
            <div className="flex items-center justify-between gap-3 p-6 pb-3 border-b shrink-0">
              <h2
                id="confirm-booking-title"
                className="text-lg font-semibold"
              >
                Confirm your booking?
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 transition-colors"
              >
                <span className="text-xl leading-none">×</span>
              </button>
            </div>
            <div className="overflow-y-auto px-6 py-4 flex-1">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm mb-4">
              <dt className="text-muted-foreground">Service</dt>
              <dd className="font-medium">
                {bookingSummary.serviceName} — {bookingSummary.durationLabel}
              </dd>
              {bookingSummary.partnerLabel ? (
                <>
                  <dt className="text-muted-foreground">Partner</dt>
                  <dd className="font-medium">{bookingSummary.partnerLabel}</dd>
                </>
              ) : null}
              <dt className="text-muted-foreground">Date</dt>
              <dd className="font-medium">{bookingSummary.dateLabel}</dd>
              <dt className="text-muted-foreground">Time</dt>
              <dd className="font-medium">{bookingSummary.timeLabel}</dd>
              <dt className="text-muted-foreground">Treatment</dt>
              <dd className={voucherResult && voucherResult.ok ? "font-medium" : "font-semibold"}>
                {bookingSummary.priceLabel}
              </dd>
              {voucherResult && voucherResult.ok && (
                <>
                  <dt className="text-muted-foreground">Voucher</dt>
                  <dd className="font-medium text-emerald-700 dark:text-emerald-300">
                    −{formatPrice(voucherResult.appliedCents)}
                  </dd>
                  <dt className="text-muted-foreground font-semibold">Total payable</dt>
                  <dd className="font-semibold">
                    {formatPrice(
                      Math.max(bookingSummary.priceCents - voucherResult.appliedCents, 0),
                    )}
                  </dd>
                </>
              )}
            </dl>
            {voucherResult && voucherResult.ok && depositsActive && (
              <p className="text-xs text-muted-foreground mb-3">
                You&apos;ll pay the $30 deposit online now; the remaining{" "}
                {formatPrice(
                  Math.max(
                    bookingSummary.priceCents - voucherResult.appliedCents - 3000,
                    0,
                  ),
                )}{" "}
                is settled in clinic at your appointment.
              </p>
            )}
            <p className="text-xs text-muted-foreground mb-5">
              Once confirmed, we’ll send you an email and SMS. To cancel or
              reschedule, contact the clinic directly.
            </p>
<label className="flex items-start gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 cursor-pointer"
                checked={policyAccepted}
                onChange={(e) => setPolicyAccepted(e.target.checked)}
              />
              <span className="text-muted-foreground">
                I have read the cancellation policy: at least 1 hour&apos;s
                notice to cancel or reschedule, and arriving more than 10
                minutes late without calling means my booking will be
                treated as cancelled.
              </span>
            </label>
                        {depositsActive && paymentStage === "card" && clientSecret ? (
                          <div className="space-y-2 my-4">
                            {paymentError && (
                              <p className="text-sm text-destructive">{paymentError}</p>
                            )}
                            <DepositCard
                              clientSecret={clientSecret}
                              amountCents={depositAmountCents}
                        baseDepositCents={depositBaseCents}
                        surchargeCents={depositSurchargeCents}
                        surchargeBps={depositSurchargeBps}
                              onSuccess={handlePaymentSuccess}
                              onError={handlePaymentError}
                            />
                          </div>
                        ) : null}
            </div>
            {/* Sticky footer — Cancel stays reachable even when Stripe's
                expanded card form makes the body scroll. */}
            <div className="flex gap-2 justify-end px-6 py-3 border-t shrink-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                disabled={pending || !policyAccepted || paymentStage !== "idle"}
                onClick={() => {
                  setConfirmOpen(false);
                  formRef.current?.requestSubmit();
                }}
              >
                Yes, confirm booking
              </Button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
