"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";

/**
 * Reads `partner` from the live URL (not a server-rendered prop) so the
 * couple selection survives even when a day tab is clicked in the brief
 * window right after CouplePicker's router.push lands but before the
 * server re-render commits — a prop-based partnerSuffix would still show
 * the pre-toggle value during that window.
 */
export function DateTabs({
  serviceSlug,
  variantId,
  dateISO,
  days,
}: {
  serviceSlug: string;
  variantId: string;
  /** Currently selected ISO yyyy-MM-dd, for highlighting. */
  dateISO: string;
  /** ISO yyyy-MM-dd strings for the 14-day strip. */
  days: string[];
}) {
  const searchParams = useSearchParams();
  const partner = searchParams.get("partner");
  const partnerSuffix = partner ? `&partner=${partner}` : "";

  return (
    <div className="flex gap-2 overflow-x-auto overflow-y-hidden pb-2 -mx-1 px-1">
      {days.map((iso) => {
        const d = parseISO(iso);
        const selected = dateISO === iso;
        return (
          <Link
            key={iso}
            href={`/book?service=${serviceSlug}&variant=${variantId}${partnerSuffix}&date=${iso}`}
            className={`shrink-0 rounded-md border px-3 py-2 text-center text-sm transition-colors ${
              selected
                ? "border-primary bg-primary text-primary-foreground"
                : "hover:bg-accent"
            }`}
          >
            <div className="text-xs opacity-80">{format(d, "EEE")}</div>
            <div className="font-semibold">{format(d, "d MMM")}</div>
          </Link>
        );
      })}
    </div>
  );
}
