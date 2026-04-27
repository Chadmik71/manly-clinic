"use client";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

export function ReschedulePicker({
  bookingId,
  slots,
  action,
}: {
  bookingId: string;
  slots: string[];
  action: (
    bookingId: string,
    iso: string,
  ) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function pick(iso: string) {
    if (!confirm(`Move your booking to ${format(new Date(iso), "EEE d MMM, h:mm a")}?`)) return;
    setErr(null);
    start(async () => {
      const res = await action(bookingId, iso);
      if (res?.error) setErr(res.error);
      else router.push("/portal/bookings");
    });
  }

  if (slots.length === 0) {
    return (
      <div className="text-sm text-muted-foreground rounded-md border border-dashed p-6 text-center">
        No slots available on this day. Try another date.
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
        {slots.map((iso) => (
          <button
            key={iso}
            type="button"
            onClick={() => pick(iso)}
            disabled={pending}
            className="rounded-md border px-2 py-2 text-center text-sm hover:bg-accent hover:border-primary transition-colors disabled:opacity-50"
          >
            {format(new Date(iso), "h:mm a")}
          </button>
        ))}
      </div>
      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}
    </div>
  );
}
