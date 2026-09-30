"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CompleteIntakeForm, type Prefill } from "@/app/(portal)/staff/bookings/[id]/complete-intake-form";
import { submitKioskForm } from "./actions";

/**
 * Client-only health form on the shop tablet: confirm it's them first (their
 * last form is pre-filled), then the form, then a hand-back screen.
 */
export function KioskForm({
  token,
  bookingId,
  displayName,
  healthFundEligible,
  isPregnancyService,
  prefill,
}: {
  token: string;
  bookingId: string;
  displayName: string;
  healthFundEligible: boolean;
  isPregnancyService: boolean;
  prefill: Prefill;
}) {
  const [step, setStep] = useState<"confirm" | "form" | "done">("confirm");

  if (step === "confirm") {
    return (
      <div className="text-center space-y-5 py-6">
        <p className="text-lg">This form is for</p>
        <p className="text-3xl font-semibold">{displayName}</p>
        <p className="text-muted-foreground">Is this you?</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="lg" onClick={() => setStep("form")}>
            Yes, that&rsquo;s me
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">Not you? Please hand the tablet back to staff.</p>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="text-center space-y-4 py-10">
        <p className="text-5xl">✓</p>
        <p className="text-2xl font-semibold">Thank you!</p>
        <p className="text-lg">Your health form is saved. Please hand the tablet back to staff.</p>
      </div>
    );
  }

  return (
    <CompleteIntakeForm
      bookingId={bookingId}
      healthFundEligible={healthFundEligible}
      isPregnancyService={isPregnancyService}
      prefill={prefill}
      action={submitKioskForm.bind(null, token)}
      audience="client"
      onDone={() => {
        setStep("done");
        window.scrollTo({ top: 0 });
      }}
    />
  );
}
