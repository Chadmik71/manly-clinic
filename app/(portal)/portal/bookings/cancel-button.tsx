"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

export function CancelBookingButton({
  id,
  startsAt,
  priceCents,
  action,
}: {
  id: string;
  startsAt: Date;
  priceCents: number;
  action: (
    id: string,
  ) => Promise<{ ok?: boolean; error?: string; feeCents?: number }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function onClick() {
    const hoursUntil = (new Date(startsAt).getTime() - Date.now()) / 36e5;
    const fee = hoursUntil < 24 ? Math.round(priceCents * 0.5) : 0;
    const message =
      fee > 0
        ? `This booking is within 24 hours of the start time. A ${formatPrice(fee)} cancellation fee applies. Continue?`
        : "Cancel this booking?";
    if (!confirm(message)) return;
    setError(null);
    start(async () => {
      const res = await action(id);
      if (res?.error) setError(res.error);
      else router.refresh();
    });
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        size="sm"
        variant="outline"
        onClick={onClick}
        disabled={pending}
      >
        {pending ? "Cancelling…" : "Cancel"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
