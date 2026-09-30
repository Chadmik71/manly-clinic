import Link from "next/link";

export type DayTask = {
  kind: "form" | "health" | "claim" | "unpaid" | "noshow";
  bookingId: string;
  time: string;
  clientName: string;
  detail: string;
};

const KIND: Record<DayTask["kind"], { label: string; dot: string }> = {
  form: { label: "Medical form needed", dot: "bg-amber-500" },
  health: { label: "Health update to read", dot: "bg-red-600" },
  claim: { label: "Health-fund claim needs the treating therapist assigned", dot: "bg-violet-600" },
  unpaid: { label: "Completed but payment not recorded", dot: "bg-emerald-700" },
  noshow: { label: "No-show yesterday: follow up", dot: "bg-slate-500" },
};

/**
 * "To do" list above the calendar: everything on this day (plus yesterday's
 * no-shows) that needs a staff action, so nobody has to open each booking.
 */
export function TodayTasks({ tasks, isToday }: { tasks: DayTask[]; isToday: boolean }) {
  if (tasks.length === 0) {
    return (
      <div className="rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground">
        ✓ Nothing to follow up {isToday ? "today" : "for this day"}.
      </div>
    );
  }
  const order: DayTask["kind"][] = ["form", "health", "claim", "unpaid", "noshow"];
  const groups = order
    .map((k) => ({ kind: k, items: tasks.filter((t) => t.kind === k) }))
    .filter((g) => g.items.length > 0);

  return (
    <details open className="rounded-md border bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold select-none">
        To do {isToday ? "today" : "for this day"} ({tasks.length})
      </summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {groups.map((g) => (
          <div key={g.kind} className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${KIND[g.kind].dot}`} />
              {KIND[g.kind].label} ({g.items.length})
            </div>
            <ul className="mt-1 space-y-0.5">
              {g.items.map((t) => (
                <li key={`${t.kind}-${t.bookingId}`} className="truncate">
                  <Link href={`/staff/bookings/${t.bookingId}`} className="hover:underline">
                    <span className="tabular-nums text-muted-foreground">{t.time}</span>{" "}
                    <span className="font-medium">{t.clientName}</span>
                    <span className="text-muted-foreground"> · {t.detail}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
