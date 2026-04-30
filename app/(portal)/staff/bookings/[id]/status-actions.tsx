"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const options = ["CONFIRMED", "COMPLETED", "NO_SHOW", "CANCELLED"] as const;

export function StatusActions({
  id,
  current,
  action,
}: {
  id: string;
  current: string;
  action: (
    id: string,
    status: string,
    notifyClient?: boolean,
  ) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  // Inline-confirm state for the CANCELLED transition. Kept null when not
  // confirming so the button row renders normally.
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [notifyClient, setNotifyClient] = useState(true);

  function set(status: string) {
    if (status === current) return;
    setErr(null);
    if (status === "CANCELLED") {
      // Don't fire the action immediately — gather notify preference first.
      setConfirmingCancel(true);
      return;
    }
    start(async () => {
      const r = await action(id, status);
      if (r?.error) setErr(r.error);
      else router.refresh();
    });
  }

  function confirmCancel() {
    setErr(null);
    start(async () => {
      const r = await action(id, "CANCELLED", notifyClient);
      if (r?.error) setErr(r.error);
      else {
        setConfirmingCancel(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      {!confirmingCancel && (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => (
            <Button
              key={opt}
              variant={opt === current ? "default" : "outline"}
              size="sm"
              disabled={pending || opt === current}
              onClick={() => set(opt)}
            >
              {opt}
            </Button>
          ))}
        </div>
      )}

      {confirmingCancel && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-3">
          <p className="text-sm font-medium">Cancel this booking?</p>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={notifyClient}
              onChange={(e) => setNotifyClient(e.target.checked)}
              className="h-4 w-4 rounded border-input"
              disabled={pending}
            />
            Notify client by email
          </label>
          <p className="text-xs text-muted-foreground">
            Staff cancellations don’t charge a late-cancel fee.
          </p>
          <div className="flex gap-2">
            <Button
              onClick={confirmCancel}
              disabled={pending}
              variant="destructive"
              size="sm"
            >
              {pending ? "Cancelling…" : "Confirm cancel"}
            </Button>
            <Button
              onClick={() => setConfirmingCancel(false)}
              disabled={pending}
              variant="outline"
              size="sm"
            >
              Back
            </Button>
          </div>
        </div>
      )}

      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}
