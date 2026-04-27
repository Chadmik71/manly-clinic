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
  action: (id: string, status: string) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  function set(status: string) {
    if (status === current) return;
    setErr(null);
    start(async () => {
      const r = await action(id, status);
      if (r?.error) setErr(r.error);
      else router.refresh();
    });
  }
  return (
    <div className="space-y-2">
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
      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}
