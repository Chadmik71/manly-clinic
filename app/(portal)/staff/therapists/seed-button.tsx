"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/**
 * One-shot bootstrap button. Calls seedPlaceholderTherapists on the server,
 * which creates 9 placeholder Therapist records (Therapist 2-10).
 *
 * Designed to be hidden once seeding has happened (parent only renders this
 * when no placeholder therapists exist yet).
 */
export function SeedPlaceholderButton({
  action,
}: {
  action: () => Promise<{ ok?: boolean; error?: string; created?: number }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function run() {
    setErr(null);
    start(async () => {
      const r = await action();
      if (r?.error) {
        setErr(r.error);
        setConfirming(false);
      } else {
        setDone(true);
        router.refresh();
      }
    });
  }

  if (done) {
    return (
      <span className="text-sm text-emerald-600 dark:text-emerald-400">
        Placeholder therapists seeded.
      </span>
    );
  }

  if (!confirming) {
    return (
      <Button
        onClick={() => setConfirming(true)}
        size="sm"
        variant="outline"
      >
        Seed 9 placeholder therapists (one-time)
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
      <span className="text-sm">
        Create Therapist 2 through Therapist 10 with full Mon\u2013Sun 9am\u20138pm availability?
      </span>
      <Button onClick={run} disabled={pending} size="sm">
        {pending ? "Seeding\u2026" : "Yes, create"}
      </Button>
      <Button
        onClick={() => setConfirming(false)}
        disabled={pending}
        size="sm"
        variant="outline"
      >
        Cancel
      </Button>
      {err && <span className="text-sm text-destructive">{err}</span>}
    </div>
  );
}
