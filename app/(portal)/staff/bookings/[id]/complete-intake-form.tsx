"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { SignaturePad } from "@/components/signature-pad";
import { BodyDiagram } from "@/components/body-diagram";
import { HEALTH_FUNDS, MEDICAL_HISTORY_GROUPS, GENDER_OPTIONS } from "@/lib/intake";

type Prefill = {
  user: {
    dob: string;
    gender: string;
    gpName: string;
    gpClinic: string;
    gpPhone: string;
    healthFundName: string;
    healthFundMemberNumber: string;
  };
  intake: {
    medicalConditions: string;
    medications: string;
    allergies: string;
    injuries: string;
    medicalHistory: string[];
    painLocationCodes: string[];
    painScale: number | null;
    painOnset: string;
    painHistory: string;
    treatmentGoals: string;
    pregnancy: boolean;
    pregnancyWeeks: number | null;
    emergencyContactName: string;
    emergencyContactRelationship: string;
    emergencyContactPhone: string;
    reasonForTreatment: string;
  } | null;
};

export function CompleteIntakeForm({
  bookingId,
  healthFundEligible,
  isPregnancyService,
  prefill,
  action,
}: {
  bookingId: string;
  healthFundEligible: boolean;
  isPregnancyService: boolean;
  prefill: Prefill;
  action: (bookingId: string, fd: FormData) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [claiming, setClaiming] = useState(healthFundEligible);
  const [pregnantChecked, setPregnantChecked] = useState(
    prefill.intake?.pregnancy ?? false,
  );
  const [history, setHistory] = useState<Set<string>>(
    new Set(prefill.intake?.medicalHistory ?? []),
  );
  const [painCodes, setPainCodes] = useState<string[]>(
    prefill.intake?.painLocationCodes ?? [],
  );
  const [painScale, setPainScale] = useState<number | null>(
    prefill.intake?.painScale ?? null,
  );
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);

  const isPregnant = isPregnancyService || pregnantChecked;

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
    if (!signatureDataUrl) {
      setError("Please ask the client to sign below.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    if (claiming) fd.set("claimWithHealthFund", "on");
    else {
      fd.delete("claimWithHealthFund");
      fd.delete("healthFundName");
      fd.delete("healthFundMemberNumber");
      fd.delete("reasonForTreatment");
    }
    if (isPregnant) fd.set("pregnancy", "on");
    else fd.delete("pregnancy");
    fd.set("signatureDataUrl", signatureDataUrl);
    fd.set("medicalHistory", JSON.stringify([...history]));
    fd.set("painLocationCodes", JSON.stringify(painCodes));
    if (painScale != null) fd.set("painScale", String(painScale));
    else fd.delete("painScale");

    start(async () => {
      const res = await action(bookingId, fd);
      if (res?.error) setError(res.error);
      else if (res?.ok) setDone(true);
    });
  }

  if (done) {
    return (
      <p className="text-sm text-emerald-600">
        Medical form completed and saved. Refresh to see the record below.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {healthFundEligible && (
        <label className="flex items-start gap-2 text-sm rounded-md border bg-card p-3">
          <input
            type="checkbox"
            checked={claiming}
            onChange={(e) => setClaiming(e.target.checked)}
            className="mt-0.5"
          />
          <span>Client is claiming this session with their health fund.</span>
        </label>
      )}
      {claiming && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="healthFundName">
              Health fund <span className="text-destructive">*</span>
            </Label>
            <select
              id="healthFundName"
              name="healthFundName"
              required
              defaultValue={prefill.user.healthFundName}
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
              defaultValue={prefill.user.healthFundMemberNumber}
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
              defaultValue={prefill.intake?.reasonForTreatment ?? ""}
              placeholder="e.g. lower back pain after long-distance running"
            />
          </div>
        </div>
      )}

      {!isPregnancyService && (
        <label className="flex items-start gap-2 text-sm rounded-md border bg-card p-3">
          <input
            type="checkbox"
            checked={pregnantChecked}
            onChange={(e) => setPregnantChecked(e.target.checked)}
            className="mt-0.5"
          />
          <span>Client is currently pregnant</span>
        </label>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="dob">Date of birth</Label>
          <Input id="dob" name="dob" type="date" defaultValue={prefill.user.dob} />
        </div>
        {isPregnancyService ? (
          <input type="hidden" name="gender" value="FEMALE" />
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="gender">Gender</Label>
            <select
              id="gender"
              name="gender"
              defaultValue={prefill.user.gender}
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

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="gpName">GP name (optional)</Label>
          <Input id="gpName" name="gpName" defaultValue={prefill.user.gpName} placeholder="Dr Jane Smith" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gpClinic">GP clinic (optional)</Label>
          <Input id="gpClinic" name="gpClinic" defaultValue={prefill.user.gpClinic} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gpPhone">GP phone (optional)</Label>
          <Input id="gpPhone" name="gpPhone" type="tel" defaultValue={prefill.user.gpPhone} />
        </div>
      </div>

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
            Other conditions or detail <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="medicalConditions"
            name="medicalConditions"
            required
            defaultValue={prefill.intake?.medicalConditions ?? ""}
            placeholder="Anything else we should know? Write 'none' if not applicable."
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="medications">
            Current medications <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="medications"
            name="medications"
            required
            defaultValue={prefill.intake?.medications ?? ""}
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
            defaultValue={prefill.intake?.allergies ?? ""}
            placeholder="oils, latex, nuts… Write 'none' if none."
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Areas of concern</Label>
        <BodyDiagram initialCodes={prefill.intake?.painLocationCodes ?? []} onChange={setPainCodes} />
        <div className="space-y-2">
          <Label className="text-sm">Pain intensity (0 = none, 10 = worst)</Label>
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
              defaultValue={prefill.intake?.painOnset ?? ""}
              placeholder="e.g. 2 weeks ago, after a fall"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="injuries">
              Recent injuries / areas to avoid <span className="text-destructive">*</span>
            </Label>
            <Input
              id="injuries"
              name="injuries"
              required
              defaultValue={prefill.intake?.injuries ?? ""}
              placeholder="recent surgery, sprains, scars to avoid. 'none' if none."
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="painHistory">Aggravating / relieving factors &amp; previous treatment</Label>
            <Textarea
              id="painHistory"
              name="painHistory"
              defaultValue={prefill.intake?.painHistory ?? ""}
              placeholder="What makes it worse / better? Seen a GP, physio, chiro?"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="treatmentGoals">Goals for this session</Label>
            <Textarea
              id="treatmentGoals"
              name="treatmentGoals"
              defaultValue={prefill.intake?.treatmentGoals ?? ""}
              placeholder="e.g. reduce lower back pain, improve mobility"
            />
          </div>
        </div>
      </div>

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
            defaultValue={prefill.intake?.pregnancyWeeks ?? ""}
            placeholder="e.g. 24"
          />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="emergencyContactName">
            Emergency contact name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="emergencyContactName"
            name="emergencyContactName"
            required
            defaultValue={prefill.intake?.emergencyContactName ?? ""}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="emergencyContactRelationship">Relationship</Label>
          <Input
            id="emergencyContactRelationship"
            name="emergencyContactRelationship"
            defaultValue={prefill.intake?.emergencyContactRelationship ?? ""}
            placeholder="e.g. partner, parent"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="emergencyContactPhone">
            Emergency contact phone <span className="text-destructive">*</span>
          </Label>
          <Input
            id="emergencyContactPhone"
            name="emergencyContactPhone"
            type="tel"
            required
            defaultValue={prefill.intake?.emergencyContactPhone ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2 rounded-md border bg-card p-4">
        <Label>
          Client signature <span className="text-destructive">*</span>
        </Label>
        <SignaturePad onChange={setSignatureDataUrl} disabled={pending} />
        <p className="text-xs text-muted-foreground">
          By signing, the client confirms the information above is accurate
          {claiming ? " and authorises us to submit a HICAPS claim on their behalf." : "."}
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save medical form"}
        </Button>
      </div>
    </form>
  );
}
