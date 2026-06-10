"use client";

import { useState } from "react";
import { updateClinicSettings } from "./actions";
import type { UpdateSettingsResult } from "./actions";

type Props = {
  initial: {
    depositsEnabled: boolean;
    cardSurchargeEnabled: boolean;
    cardSurchargeBps: number;
    reviewRequestEnabled: boolean;
  };
};

export function SettingsForm({ initial }: Props) {
  const [depositsEnabled, setDepositsEnabled] = useState(initial.depositsEnabled);
  const [cardSurchargeEnabled, setCardSurchargeEnabled] = useState(
    initial.cardSurchargeEnabled,
  );
  const [cardSurchargeBps, setCardSurchargeBps] = useState(
    String(initial.cardSurchargeBps),
  );
  const [reviewRequestEnabled, setReviewRequestEnabled] = useState(
    initial.reviewRequestEnabled,
  );
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<
    null | { kind: "ok" } | { kind: "error"; message: string }
  >(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    const bps = parseInt(cardSurchargeBps, 10);
    if (Number.isNaN(bps)) {
      setResult({ kind: "error", message: "Card surcharge must be a number." });
      setPending(false);
      return;
    }
    const r: UpdateSettingsResult = await updateClinicSettings({
      depositsEnabled,
      cardSurchargeEnabled,
      cardSurchargeBps: bps,
      reviewRequestEnabled,
    });
    if (r.ok) {
      setResult({ kind: "ok" });
    } else {
      setResult({ kind: "error", message: r.error });
    }
    setPending(false);
  }

  // Pre-compute display string outside JSX to keep the JSX free of $ adjacent to { problems.
  const pctStr = (() => {
    const n = parseInt(cardSurchargeBps, 10);
    return Number.isFinite(n) ? (n / 100).toFixed(2) + "%" : "-";
  })();

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <label className="flex items-start justify-between gap-4 rounded-md border bg-card p-4">
        <span className="flex-1">
          <span className="block text-sm font-medium">Deposits enabled</span>
          <span className="block text-xs text-muted-foreground">
            When OFF, the booking flow refuses to create new PaymentIntents (returns 503). Existing bookings are not affected.
          </span>
        </span>
        <input
          type="checkbox"
          checked={depositsEnabled}
          onChange={(e) => setDepositsEnabled(e.target.checked)}
          className="mt-1 h-5 w-5"
          disabled={pending}
        />
      </label>

      <label className="flex items-start justify-between gap-4 rounded-md border bg-card p-4">
        <span className="flex-1">
          <span className="block text-sm font-medium">Card surcharge enabled</span>
          <span className="block text-xs text-muted-foreground">
            Adds a percentage surcharge to each deposit. Shown as an itemised line on the customer confirm page for ACCC compliance.
          </span>
        </span>
        <input
          type="checkbox"
          checked={cardSurchargeEnabled}
          onChange={(e) => setCardSurchargeEnabled(e.target.checked)}
          className="mt-1 h-5 w-5"
          disabled={pending}
        />
      </label>

      <label className="flex items-start justify-between gap-4 rounded-md border bg-card p-4">
        <span className="flex-1">
          <span className="block text-sm font-medium">Post-visit Google review SMS</span>
          <span className="block text-xs text-muted-foreground">
            When ON, the day after you mark a session Complete, customers who opted into news/updates get a thank-you SMS with a one-tap Google review link. Each customer is asked at most once every 90 days.
          </span>
        </span>
        <input
          type="checkbox"
          checked={reviewRequestEnabled}
          onChange={(e) => setReviewRequestEnabled(e.target.checked)}
          className="mt-1 h-5 w-5"
          disabled={pending}
        />
      </label>

      <label className="block space-y-2 rounded-md border bg-card p-4">
        <span className="block text-sm font-medium">
          Card surcharge rate (basis points)
        </span>
        <span className="block text-xs text-muted-foreground">
          100 bps = 1.00%. Current setting: {pctStr}. Recommended 150-200 (1.5-2%) to roughly match Stripe AU domestic fees. Hard cap 500 (5%).
        </span>
        <input
          type="number"
          min={0}
          max={500}
          step={1}
          value={cardSurchargeBps}
          onChange={(e) => setCardSurchargeBps(e.target.value)}
          disabled={pending}
          className="w-32 rounded border px-2 py-1 text-sm"
        />
      </label>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? "Saving..." : "Save settings"}
        </button>
        {result?.kind === "ok" ? (
          <span className="text-sm text-green-600">Saved.</span>
        ) : null}
        {result?.kind === "error" ? (
          <span className="text-sm text-red-600">{result.message}</span>
        ) : null}
      </div>
    </form>
  );
}
