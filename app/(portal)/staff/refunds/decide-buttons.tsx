"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Approve / Decline buttons for a pending refund request. Decline expands
 * into a small reason field; approve is one click (with a confirm prompt
 * because it moves real money via Stripe).
 */
export function DecideRefundButtons({
  requestId,
  amountLabel,
  reference,
  approveAction,
  declineAction,
}: {
  requestId: string;
  amountLabel: string;
  reference: string;
  approveAction: (id: string) => Promise<{ ok?: boolean; error?: string }>;
  declineAction: (
    id: string,
    reason: string | null,
  ) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"idle" | "declining">("idle");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function approve() {
    if (
      !confirm(
        `Refund ${amountLabel} for booking ${reference} via Stripe? The booking will be cancelled. This cannot be undone from this page.`,
      )
    )
      return;
    setError(null);
    start(async () => {
      const res = await approveAction(requestId);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  function decline() {
    setError(null);
    start(async () => {
      const res = await declineAction(requestId, reason.trim() || null);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }

  if (mode === "declining") {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason shown to the client (optional, 500 chars max)"
          maxLength={500}
          rows={2}
          className="w-full sm:w-80 rounded-md border bg-background px-2 py-1.5 text-sm"
          disabled={pending}
        />
        <div className="flex gap-2 justify-end">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setMode("idle");
              setReason("");
              setError(null);
            }}
            disabled={pending}
          >
            Back
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={decline}
            disabled={pending}
          >
            {pending ? "Declining…" : "Confirm decline"}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setMode("declining")}
          disabled={pending}
        >
          Decline
        </Button>
        <Button size="sm" onClick={approve} disabled={pending}>
          {pending ? "Refunding…" : "Approve & refund"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
