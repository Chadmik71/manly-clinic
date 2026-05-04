"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export interface StaffOption {
  id: string;
  name: string;
  role: string; // "STAFF" | "ADMIN"
}

/**
 * Therapist assignment dropdown for the staff booking detail page.
 * Sets Booking.assignedTherapistId etc. via the server action.
 *
 * - Customer never sees this value (they see slotLabel)
 * - Mandatory for health-fund bookings before they can be marked COMPLETED
 * - Empty selection unassigns
 *
 * The action is passed in by the parent so this component is decoupled
 * from the action's import path.
 */
export function AssignTherapistForm({
  bookingId,
  currentAssignedId,
  currentAssignedName,
  staffOptions,
  action,
}: {
  bookingId: string;
  currentAssignedId: string | null;
  currentAssignedName: string | null;
  staffOptions: StaffOption[];
  action: (
    bookingId: string,
    userId: string,
  ) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState(currentAssignedId ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [savedJustNow, setSavedJustNow] = useState(false);

  const dirty = selected !== (currentAssignedId ?? "");

  function save() {
    setErr(null);
    setSavedJustNow(false);
    start(async () => {
      const r = await action(bookingId, selected);
      if (r?.error) {
        setErr(r.error);
      } else {
        setSavedJustNow(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="assigned-therapist-select">
        Therapist who performed the session
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="assigned-therapist-select"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setErr(null);
            setSavedJustNow(false);
          }}
          disabled={pending}
          className="flex h-9 min-w-[220px] rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">— Unassigned —</option>
          {staffOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.name}
              {opt.role === "ADMIN" ? " (admin)" : ""}
            </option>
          ))}
        </select>
        {dirty && (
          <Button onClick={save} disabled={pending} size="sm">
            {pending ? "Saving…" : selected ? "Assign" : "Unassign"}
          </Button>
        )}
        {!dirty && currentAssignedName && (
          <span className="text-sm text-muted-foreground">
            Currently: <span className="font-medium">{currentAssignedName}</span>
          </span>
        )}
        {!dirty && !currentAssignedName && (
          <span className="text-sm text-muted-foreground italic">
            Not yet assigned
          </span>
        )}
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {savedJustNow && !err && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          Saved.
        </p>
      )}
    </div>
  );
}
