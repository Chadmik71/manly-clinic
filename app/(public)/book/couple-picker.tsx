"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { formatPrice, formatDuration, categoryLabel } from "@/lib/utils";

type PartnerVariant = {
  id: string;
  durationMin: number;
  priceCents: number;
  serviceName: string;
  category: string;
};

// Show categories in this order in the dropdown — therapeutic first because
// most couple bookings want clinical work, relaxation second.
const CATEGORY_ORDER = ["THERAPEUTIC", "RELAXATION", "SPECIALTY", "ADD_ON"];

/**
 * Toggle for couple booking. When checked, reveals a dropdown of available
 * service variants for the partner. Selecting one pushes &partner=<variantId>
 * into the URL; everything else (slot picker, confirm flow) reads it from there.
 *
 * The partner can pick any service and any duration — the slot logic
 * upstream intersects per-duration availability so only times that work
 * for both halves show.
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
    if (!next) {
      setPartner(null);
    } else if (partnerVariants.length > 0 && !selectedPartnerId) {
      // Default to the first partner variant on toggle so the URL immediately
      // carries `&partner=...`. Without this, customers can leave the dropdown
      // unselected and unknowingly submit a solo booking.
      setPartner(partnerVariants[0].id);
    }
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
                value={selectedPartnerId ?? partnerVariants[0]?.id ?? ""}
                onChange={(e) => setPartner(e.target.value || null)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {CATEGORY_ORDER.flatMap((cat) => {
                  const inCat = partnerVariants.filter((pv) => pv.category === cat);
                  if (inCat.length === 0) return [];
                  return [
                    <optgroup key={cat} label={categoryLabel(cat)}>
                      {inCat.map((pv) => (
                        <option key={pv.id} value={pv.id}>
                          {pv.serviceName} — {formatDuration(pv.durationMin)}{" "}
                          ({formatPrice(pv.priceCents)})
                        </option>
                      ))}
                    </optgroup>,
                  ];
                })}
              </select>
              <p className="text-xs text-muted-foreground">
                Pick any service and any duration — your partner can finish
                earlier or later than you.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
