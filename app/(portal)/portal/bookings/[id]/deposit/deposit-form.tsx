"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";

// Lightweight Stripe Elements integration loaded client-side only when this
// page is opened. Falls back to "pay in clinic" copy if anything goes wrong.
export function DepositForm({
  bookingId,
  expectedAmount,
}: {
  bookingId: string;
  expectedAmount: number;
}) {
  const [status, setStatus] = useState<"idle" | "creating" | "ready" | "paying" | "succeeded" | "error">("idle");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [pubKey, setPubKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus("creating");
    fetch(`/api/bookings/${bookingId}/deposit`, { method: "POST" })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => null);
          throw new Error(data?.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data: { clientSecret: string; publishableKey: string }) => {
        setClientSecret(data.clientSecret);
        setPubKey(data.publishableKey);
        setStatus("ready");
      })
      .catch((e: Error) => {
        setError(e.message);
        setStatus("error");
      });
  }, [bookingId]);

  // Lazy-load Stripe.js + Elements only when ready
  useEffect(() => {
    if (status !== "ready" || !clientSecret || !pubKey) return;
    let cancelled = false;
    (async () => {
      const { loadStripe } = await import("@stripe/stripe-js");
      const stripe = await loadStripe(pubKey);
      if (!stripe || cancelled) return;
      const elements = stripe.elements({ clientSecret });
      const card = elements.create("payment");
      card.mount("#stripe-mount");

      const btn = document.getElementById("stripe-pay") as HTMLButtonElement | null;
      btn?.addEventListener("click", async () => {
        setStatus("paying");
        const { error: err } = await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: window.location.href },
          redirect: "if_required",
        });
        if (err) {
          setError(err.message ?? "Payment failed.");
          setStatus("error");
        } else {
          setStatus("succeeded");
        }
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [status, clientSecret, pubKey]);

  if (status === "succeeded") {
    return (
      <p className="text-emerald-600 text-sm">
        Deposit received — thanks! You&apos;ll get an updated receipt by email.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Pay a {formatPrice(expectedAmount)} deposit now to lock in your slot.
        The balance is settled in clinic.
      </p>
      {status === "creating" && (
        <p className="text-sm text-muted-foreground">Preparing payment…</p>
      )}
      {status === "error" && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <div id="stripe-mount" />
      {status === "ready" && (
        <Button id="stripe-pay" type="button">
          Pay {formatPrice(expectedAmount)}
        </Button>
      )}
      {status === "paying" && (
        <p className="text-sm text-muted-foreground">Processing…</p>
      )}
    </div>
  );
}
