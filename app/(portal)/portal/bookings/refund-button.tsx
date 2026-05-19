"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * Inline "Request refund" UI for the My Bookings card. Shows a button
 * that, when clicked, expands into a small reason field. Submission calls
 * the requestRefund server action; on success the page refreshes and the
 * parent shows the pending badge instead of the button.
 *
 * Eligibility (paid, upcoming, no open request, >1h out) is computed by
 * the server page — this component just renders when told to.
 */
export function RefundRequestButton({
  id,
  action,
}: {
  id: string;
  action: (
    id: string,
    reason: string | null,
  ) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    setError(null);
    start(async () => {
      const res = await action(id, reason.trim() || null);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Request refund
      </Button>
    );
  }
  return (
    <div className="flex flex-col items-end gap-2 w-full sm:w-72">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional, 500 chars max)"
        maxLength={500}
        rows={2}
        className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
        disabled={pending}
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setReason("");
            setError(null);
          }}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button size="sm" onClick={submit} disabled={pending}>
          {pending ? "Submitting…" : "Submit request"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
