"use client";
import Link from "next/link";
import { format } from "date-fns";

// Bucket boundaries (local browser TZ — Sydney for the vast majority of
// our customers). Splitting the flat slot list into Morning / Afternoon /
// Evening lets phone users jump straight to the time of day they want
// instead of scanning the whole list.
const MORNING_END_HOUR = 12; // < 12:00 -> Morning
const EVENING_START_HOUR = 17; // >= 17:00 -> Evening, else Afternoon

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

  const groups: { label: string; slots: string[] }[] = [
    { label: "Morning", slots: [] },
    { label: "Afternoon", slots: [] },
    { label: "Evening", slots: [] },
  ];
  for (const iso of slots) {
    const h = new Date(iso).getHours();
    if (h < MORNING_END_HOUR) groups[0].slots.push(iso);
    else if (h < EVENING_START_HOUR) groups[1].slots.push(iso);
    else groups[2].slots.push(iso);
  }

  const partnerSuffix = partnerVariantId
    ? `&partner=${partnerVariantId}`
    : "";

  return (
    <div className="space-y-4">
      {groups.map((g) =>
        g.slots.length === 0 ? null : (
          <div key={g.label}>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {g.label}
              <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground/70">
                ({g.slots.length})
              </span>
            </h3>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {g.slots.map((iso) => {
                const t = new Date(iso);
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
          </div>
        ),
      )}
    </div>
  );
}
