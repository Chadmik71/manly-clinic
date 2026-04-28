"use client";

import { useState, useTransition } from "react";
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
import {
  MEDICAL_HISTORY_GROUPS,
  AU_STATES,
  GENDER_OPTIONS,
} from "@/lib/intake";

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
};

const HEALTH_FUNDS = [
  "ACA Health Benefits Fund",
  "AHM",
  "Australian Unity",
  "Bupa",
  "CBHS Corporate Health",
  "CBHS Health Fund",
  "Cessnock District Health",
  "CUA Health",
  "Defence Health",
  "Doctors' Health Fund",
  "Emergency Services Health",
  "Frank Health Insurance",
  "GMHBA",
  "HBF",
  "HCF",
  "HCI (Health Care Insurance)",
  "Health.com.au",
  "Health Partners",
  "HIF (Health Insurance Fund)",
  "Latrobe Health Services",
  "Medibank",
  "Mildura Health Fund",
  "myOwn Health Insurance",
  "Navy Health",
  "NIB",
  "Nurses & Midwives Health",
  "Onemedifund",
  "Peoplecare",
  "Phoenix Health Fund",
  "Police Health",
  "Queensland Country Health Fund",
  "RBHS (Reserve Bank Health Society)",
  "RT Health",
  "St.LukesHealth",
  "Teachers Health",
  "Transport Health",
  "TUH (Teachers Union Health)",
  "Union Health",
  "Westfund",
  "Other",
];

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
  intakeDefaults,
  userDefaults,
  isGuest,
  signedInEmail,
}: {
  action: (
    formData: FormData,
  ) => Promise<{ ok?: boolean; error?: string; reference?: string }>;
  serviceId: string;
  variantId: string;
  startsIso: string;
  serviceHealthFundEligible: boolean;
  intakeDefaults: IntakeDefaults;
  userDefaults: UserDefaults;
  isGuest: boolean;
  signedInEmail: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [guestSuccess, setGuestSuccess] = useState<{
    reference: string;
  } | null>(null);
  const [pregnant, setPregnant] = useState<boolean>(
    intakeDefaults?.pregnancy ?? false,
  );
  const [claiming, setClaiming] = useState<boolean>(false);
  const [pain, setPain] = useState<number | null>(
    intakeDefaults?.painScale ?? null,
  );
  const [history, setHistory] = useState<Set<string>>(
    new Set(intakeDefaults?.medicalHistory ?? []),
  );

  const intakeRequired = claiming;

  function toggleHistory(code: string, on: boolean) {
    setHistory((s) => {
      const next = new Set(s);
      if (on) next.add(code);
      else next.delete(code);
      return next;
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    fd.set("serviceId", serviceId);
    fd.set("variantId", variantId);
    fd.set("startsIso", startsIso);
    fd.set("medicalHistory", JSON.stringify([...history]));
    if (pain != null) fd.set("painScale", String(pain));
    start(async () => {
      const res = await action(fd);
      if (res?.error) setError(res.error);
      else if (res?.reference) {
        if (isGuest) {
          setGuestSuccess({ reference: res.reference });
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          window.location.href = `/portal/bookings/confirmed?ref=${res.reference}`;
        }
      }
    });
  }

  // Step number offset: when guest, the 11 numbered sections become 1..11 too
  // (the guest contact section is rendered as "Step 1" and the rest shift up
  // by 1). When signed in, the original 1..10/11 numbering is preserved.
  const offset = isGuest ? 1 : 0;
  const stepNo = (n: number) => String(n + offset);
  const lastClinicalStep = serviceHealthFundEligible ? 11 : 10;

  return (
    <form onSubmit={onSubmit} className="space-y-5">
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
            step="1"
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

      {/* 1. Patient details */}
      <Card>
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
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="addressLine1">Street address</Label>
              <Input
                id="addressLine1"
                name="addressLine1"
                defaultValue={userDefaults.addressLine1}
                placeholder="e.g. 12 Smith Street"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="suburb">Suburb</Label>
              <Input
                id="suburb"
                name="suburb"
                defaultValue={userDefaults.suburb}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="stateRegion">State</Label>
                <select
                  id="stateRegion"
                  name="stateRegion"
                  defaultValue={userDefaults.stateRegion}
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">—</option>
                  {AU_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="postcode">Postcode</Label>
                <Input
                  id="postcode"
                  name="postcode"
                  defaultValue={userDefaults.postcode}
                  placeholder="2095"
                />
              </div>
            </div>
          </FieldGrid>
        </CardContent>
      </Card>

      {/* 2. GP / referring doctor */}
      <Card>
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
      </Card>

      {/* 3. Medical history checklist */}
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

      {/* 4. Medications + allergies */}
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

      {/* 5. Presenting complaint */}
      <Card>
        <SectionHeader
          step={stepNo(5)}
          title="Why are you seeing us today?"
          desc="If this is a relaxation booking, you can leave most fields blank."
        />
        <CardContent className="pb-5">
          <FieldGrid>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="painLocation">Area of concern / pain location</Label>
              <Input
                id="painLocation"
                name="painLocation"
                defaultValue={intakeDefaults?.painLocation ?? ""}
                placeholder="e.g. lower back, right side; left shoulder"
              />
            </div>
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

      {/* 6. Pregnancy */}
      <Card>
        <SectionHeader step={stepNo(6)} title="Pregnancy" />
        <CardContent className="pb-5 pt-4 space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="pregnancy"
              checked={pregnant}
              onChange={(e) => setPregnant(e.target.checked)}
            />
            <span>I am currently pregnant</span>
          </label>
          {pregnant && (
            <div className="ml-6 max-w-xs space-y-1">
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

      {/* 7. Emergency contact */}
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
                      defaultValue={intakeDefaults?.healthFundName ?? ""}
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
                      defaultValue={intakeDefaults?.healthFundMemberNumber ?? ""}
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

      {/* 9 (or 8). Voucher */}
      <Card>
        <SectionHeader
          step={stepNo(serviceHealthFundEligible ? 9 : 8)}
          title="Gift voucher (optional)"
          desc="Got a code? We'll deduct the balance, up to the session price."
        />
        <CardContent className="pb-5 pt-4">
          <Input
            name="voucherCode"
            placeholder="GV-XXXX-XXXX"
            className="max-w-xs uppercase font-mono"
          />
        </CardContent>
      </Card>

      {/* 10 (or 9). Notes */}
      <Card>
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
      </Card>

      {/* 11 (or 10). Consent */}
      <Card>
        <SectionHeader
          step={stepNo(lastClinicalStep)}
          title="Consent"
          desc="Required by the Privacy Act 1988 (Cth) — Australian Privacy Principle 3."
        />
        <CardContent className="pb-5 pt-4 space-y-3 text-sm">
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

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-3 justify-end">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Booking…" : "Confirm booking"}
        </Button>
      </div>

      {/* Suppress unused-prop warning if signedInEmail not displayed elsewhere */}
      <input type="hidden" name="_signedInEmail" value={signedInEmail ?? ""} />
    </form>
  );
}
