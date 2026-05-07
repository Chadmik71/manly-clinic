"use client";
import Link from "next/link";
import { format } from "date-fns";

export function SlotPicker({
  slots,
  serviceSlug,
  variantId,
  date,
  partnerVariantId,
}: {
  slots: string[];
  serviceSlug: string;
  variantId: string;
  date: string;
  /**
   * Optional partner variant id for couple bookings. When set, gets forwarded
   * as &partner=... on the confirm URL so the partner-half is created in the
   * same atomic transaction as the primary half.
   */
  partnerVariantId?: string;
}) {
  if (slots.length === 0) {
    return (
      <div className="text-sm text-muted-foreground rounded-md border border-dashed p-6 text-center">
        No slots available on this day. Try another date or call the clinic.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
      {slots.map((iso) => {
        const t = new Date(iso);
        const partnerSuffix = partnerVariantId ? `&partner=${partnerVariantId}` : "";
        const url = `/book/confirm?service=${serviceSlug}&variant=${variantId}${partnerSuffix}&starts=${encodeURIComponent(iso)}&date=${date}`;
        return (
          <Link
            key={iso}
            href={url}
            className="rounded-md border px-2 py-2 text-center text-sm hover:bg-accent hover:border-primary transition-colors"
          >
            {format(t, "h:mm a")}
          </Link>
        );
      })}
    </div>
  );
}
