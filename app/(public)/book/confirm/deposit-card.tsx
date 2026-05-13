"use client";

// Stripe Elements card UI for collecting the booking deposit.
//
// Used by the booking confirm form when deposits are enabled. The parent
// component fetches a clientSecret from /api/bookings/payment-intent first,
// then renders <DepositCard clientSecret={...} ... /> to collect payment.
//
// On payment success, calls onSuccess(paymentIntentId). The parent then
// proceeds with createBooking, passing the paymentIntentId so the booking
// row gets paidCents=3000 attached.
//
// If NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing, the component renders
// null — the parent should never call this without checking depositsEnabled
// on the client side via the same env var.

import { useState } from "react";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";

// Singleton — loadStripe is heavy and should only run once per page load.
let _stripePromise: Promise<Stripe | null> | null = null;
function getStripePromise(): Promise<Stripe | null> | null {
  if (_stripePromise) return _stripePromise;
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return null;
  _stripePromise = loadStripe(key);
  return _stripePromise;
}

type DepositCardProps = {
  clientSecret: string;
  amountCents: number;
  baseDepositCents?: number;
  surchargeCents?: number;
  surchargeBps?: number;
  onSuccess: (paymentIntentId: string) => void;
  onError: (message: string) => void;
};

function CardForm({
  amountCents,
  baseDepositCents,
  surchargeCents,
  surchargeBps,
  onSuccess,
  onError,
}: Omit<DepositCardProps, "clientSecret">) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);

  const dollars = (amountCents / 100).toFixed(2);
  // Pre-compute surcharge breakdown strings. Doing this outside JSX
  // sidesteps any TypeScript narrowing issues across child expressions.
  const hasSurcharge =
    typeof surchargeCents === "number" &&
    surchargeCents > 0 &&
    typeof baseDepositCents === "number";
  const baseStr =
    typeof baseDepositCents === "number"
      ? (baseDepositCents / 100).toFixed(2)
      : "";
  const surchargeStr =
    typeof surchargeCents === "number"
      ? (surchargeCents / 100).toFixed(2)
      : "";
  const surchargePctStr =
    typeof surchargeBps === "number" && surchargeBps > 0
      ? (surchargeBps / 100).toFixed(2)
      : "";

  async function handlePay() {
    if (!stripe || !elements) return;
    setPaying(true);

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: "if_required",
    });

    if (error) {
      setPaying(false);
      onError(error.message ?? "Payment failed. Please try again.");
      return;
    }

    if (paymentIntent?.status === "succeeded") {
      // Keep `paying` true through the success callback so the button
      // stays disabled while the parent calls createBooking.
      onSuccess(paymentIntent.id);
      return;
    }

    setPaying(false);
    onError(
      "Payment did not complete. Please check your card details and try again.",
    );
  }

  return (
    <div className="space-y-4 rounded-md border bg-card p-4 mb-32 scroll-mt-24" id="deposit-card-wrapper">
      {hasSurcharge ? (
        <div className="text-xs text-muted-foreground space-y-1 -mb-2">
          <div className="flex justify-between">
            <span>Booking deposit</span>
            <span>{"$" + baseStr}</span>
          </div>
          <div className="flex justify-between">
            <span>
              {surchargePctStr
                ? "Card surcharge (" + surchargePctStr + "%)"
                : "Card surcharge"}
            </span>
            <span>{"$" + surchargeStr}</span>
          </div>
        </div>
      ) : null}
      <div className="text-sm font-medium">
        Deposit: ${dollars} AUD
      </div>
      <div className="text-xs text-muted-foreground">
        {`Your card will be charged $${dollars} to confirm this booking. The deposit is refundable if you cancel with at least 1 hour\u0027s notice per our cancellation policy.`}
      </div>
      <PaymentElement />
      <Button
        type="button"
        onClick={handlePay}
        disabled={!stripe || !elements || paying}
        className="w-full"
        size="lg"
      >
        {paying ? "Processing payment..." : `Pay $${dollars} deposit & confirm booking`}
      </Button>
    </div>
  );
}

export function DepositCard(props: DepositCardProps) {
  const stripePromise = getStripePromise();
  if (!stripePromise) {
    // Missing publishable key — render nothing. The parent should have
    // already checked depositsEnabled() on the server, so reaching this
    // path means an env var is misconfigured. Failing closed prevents
    // a broken UI for customers.
    return null;
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret: props.clientSecret,
        appearance: { theme: "stripe" },
      }}
    >
      <CardForm
        amountCents={props.amountCents}
        onSuccess={props.onSuccess}
        onError={props.onError}
      />
    </Elements>
  );
}
