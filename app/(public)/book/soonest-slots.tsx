"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Zap } from "lucide-react";

const SYD = "Australia/Sydney";
const dayFmt = new Intl.DateTimeFormat("en-AU", { timeZone: SYD, weekday: "short", day: "numeric", month: "short" });
const timeFmt = new Intl.DateTimeFormat("en-AU", { timeZone: SYD, hour: "numeric", minute: "2-digit", hour12: true });
const isoDayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: SYD });

/**
 * "Soonest available" shortcuts above the date strip: the next few free
 * times across the coming days, one tap straight to the confirm step. Handy
 * for someone in pain who wants the first slot, not a day-by-day hunt.
 */
export function SoonestSlots({
  slots,
  serviceSlug,
  variantId,
  partnerVariantId,
}: {
  /** ISO start times, soonest first. */
  slots: string[];
  serviceSlug: string;
  variantId: string;
  partnerVariantId?: string;
}) {
  // Read the partner from the live URL (same reason as SlotPicker: the prop
  // can lag a moment behind the couple-booking checkbox).
  const searchParams = useSearchParams();
  const partnerId = searchParams.get("partner") ?? partnerVariantId ?? "";
  const partnerSuffix = partnerId ? `&partner=${encodeURIComponent(partnerId)}` : "";
  if (slots.length === 0) return null;

  const todayIso = isoDayFmt.format(new Date());
  const tomorrowIso = isoDayFmt.format(new Date(Date.now() + 24 * 3600 * 1000));
  const dayLabel = (d: Date) => {
    const iso = isoDayFmt.format(d);
    if (iso === todayIso) return "Today";
    if (iso === tomorrowIso) return "Tomorrow";
    return dayFmt.format(d);
  };

  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <Zap className="h-4 w-4 text-primary" />
        Soonest available
      </div>
      <div className="flex flex-wrap gap-2">
        {slots.map((iso) => {
          const d = new Date(iso);
          const date = isoDayFmt.format(d);
          const href = `/book/confirm?service=${serviceSlug}&variant=${variantId}${partnerSuffix}&starts=${encodeURIComponent(iso)}&date=${date}`;
          return (
            <Link
              key={iso}
              href={href}
              className="rounded-md border bg-background px-3 py-1.5 text-sm hover:border-primary hover:bg-primary/10 transition-colors"
            >
              <span className="font-medium">{dayLabel(d)}</span>{" "}
              <span className="text-muted-foreground">{timeFmt.format(d).toLowerCase()}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
