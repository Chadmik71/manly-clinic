"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { CompleteIntakeForm, type Prefill } from "@/app/(portal)/staff/bookings/[id]/complete-intake-form";
import { kioskSendAccountLink, submitKioskForm } from "./actions";

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
  account,
}: {
  token: string;
  bookingId: string;
  displayName: string;
  healthFundEligible: boolean;
  isPregnancyService: boolean;
  prefill: Prefill;
  /** Offer an online-account link at the end (null = don't offer). */
  account: { needsEmail: boolean; maskedEmail: string | null } | null;
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

  if (step === "done") return <KioskDone token={token} account={account} />;

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

/** Hand-back screen (also shown by the page itself once the form is saved). */
export function KioskDone({
  token,
  account,
}: {
  token: string;
  account: { needsEmail: boolean; maskedEmail: string | null } | null;
}) {
  return (
    <div className="text-center space-y-4 py-10">
      <p className="text-5xl">✓</p>
      <p className="text-2xl font-semibold">Thank you!</p>
      <p className="text-lg">Your health form is saved. Please hand the tablet back to staff.</p>
      {account && <AccountLink token={token} account={account} />}
    </div>
  );
}

/** Optional: email the client a link to set up their online account. */
function AccountLink({
  token,
  account,
}: {
  token: string;
  account: { needsEmail: boolean; maskedEmail: string | null };
}) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (sentTo) {
    return (
      <div className="mx-auto mt-6 max-w-md rounded-lg border p-4 text-left">
        <p className="font-medium">✓ Link sent to {sentTo}</p>
        <p className="text-sm text-muted-foreground">Check your email to choose a password. Next time you can book online with your details already filled in.</p>
      </div>
    );
  }
  return (
    <form
      className="mx-auto mt-6 max-w-md space-y-3 rounded-lg border p-4 text-left"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await kioskSendAccountLink(token, account.needsEmail ? email : undefined);
          if (res.error || !res.sentTo) return setError(res.error ?? "Couldn't send the link.");
          setSentTo(res.sentTo);
        });
      }}
    >
      <p className="font-medium">Book online next time? (optional)</p>
      <p className="text-sm text-muted-foreground">
        {account.needsEmail
          ? "Enter your email and we'll send you a link to set up your online account."
          : `We'll email a link to ${account.maskedEmail} to set up your online account.`}
      </p>
      {account.needsEmail && (
        <input
          type="email"
          aria-label="Your email"
          autoComplete="email"
          inputMode="email"
          className="w-full rounded-md border bg-background px-3 py-2"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Email me a link to set up my account"}
      </Button>
    </form>
  );
}
