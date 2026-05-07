"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { formatPrice, formatDuration } from "@/lib/utils";

type PartnerVariant = {
  id: string;
  durationMin: number;
  priceCents: number;
  serviceName: string;
};

/**
 * Toggle for couple booking. When checked, reveals a dropdown of available
 * service variants for the partner. Selecting one pushes &partner=<variantId>
 * into the URL; everything else (slot picker, confirm flow) reads it from there.
 *
 * Constraint: partner duration must match the primary duration (so they finish
 * at the same time). The partnerVariants list is filtered server-side by the
 * primary variant’s durationMin.
 */
export function CouplePicker({
  partnerVariants,
  selectedPartnerId,
}: {
  partnerVariants: PartnerVariant[];
  selectedPartnerId: string | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isCouple, setIsCouple] = useState(Boolean(selectedPartnerId));

  function setPartner(id: string | null) {
    const params = new URLSearchParams(sp);
    if (id) {
      params.set("partner", id);
    } else {
      params.delete("partner");
    }
    router.push(`/book?${params.toString()}`);
  }

  function onToggle(next: boolean) {
    setIsCouple(next);
    if (!next) setPartner(null);
  }

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={isCouple}
          onChange={(e) => onToggle(e.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <span className="text-sm">
          <span className="font-medium">Booking for two (couple massage)</span>
          <span className="block text-muted-foreground text-[13px] mt-0.5">
            We’ll book two therapists side by side at the same time. Your
            partner can pick their own service below.
          </span>
        </span>
      </label>

      {isCouple && (
        <div className="pl-7 space-y-2">
          {partnerVariants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No partner services match this duration. Try a different duration
              for the primary booking.
            </p>
          ) : (
            <div className="space-y-1.5">
              <label
                htmlFor="partner-variant"
                className="text-sm font-medium"
              >
                Partner’s service
              </label>
              <select
                id="partner-variant"
                value={selectedPartnerId ?? ""}
                onChange={(e) => setPartner(e.target.value || null)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">— Choose partner’s service —</option>
                {partnerVariants.map((pv) => (
                  <option key={pv.id} value={pv.id}>
                    {pv.serviceName} — {formatDuration(pv.durationMin)}{" "}
                    ({formatPrice(pv.priceCents)})
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Same duration as your booking so you finish together.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
