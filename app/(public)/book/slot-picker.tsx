"use client";
import Link from "next/link";
import { format } from "date-fns";

export function SlotPicker({
  slots,
  serviceSlug,
  variantId,
  date,
}: {
  slots: string[];
  serviceSlug: string;
  variantId: string;
  date: string;
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
        const url = `/book/confirm?service=${serviceSlug}&variant=${variantId}&starts=${encodeURIComponent(iso)}&date=${date}`;
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
