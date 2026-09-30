"use client";

import { useState, useTransition } from "react";
import { Tablet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { startClientMode } from "@/app/(portal)/staff/bookings/[id]/kiosk-actions";

/**
 * Opens the client-only health form on this device and locks it there until
 * a staff member unlocks it with their password (lib/kiosk.ts).
 */
export function HandToClientButton({
  bookingId,
  size = "default",
  className,
}: {
  bookingId: string;
  size?: "default" | "sm";
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className={className}>
      <Button
        type="button"
        size={size}
        variant="outline"
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            const res = await startClientMode(bookingId);
            if (res.error || !res.url) return setError(res.error ?? "Couldn't start client mode.");
            window.location.href = res.url;
          });
        }}
      >
        <Tablet className="h-4 w-4 mr-1" />
        {pending ? "Opening…" : "Hand tablet to client"}
      </Button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
