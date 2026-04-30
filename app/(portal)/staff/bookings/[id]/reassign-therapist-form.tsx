"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export interface TherapistOption {
  id: string;
  name: string;
}

export function ReassignTherapistForm({
  bookingId,
  currentTherapistId,
  therapists,
  action,
}: {
  bookingId: string;
  currentTherapistId: string | null;
  therapists: TherapistOption[];
  action: (
    bookingId: string,
    therapistId: string,
  ) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [selected, setSelected] = useState<string>(currentTherapistId ?? "");

  const dirty = selected !== (currentTherapistId ?? "");

  function save() {
    setErr(null);
    setSaved(false);
    start(async () => {
      const r = await action(bookingId, selected);
      if (r?.error) {
        setErr(r.error);
      } else {
        setSaved(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          setSaved(false);
          setErr(null);
        }}
        disabled={pending}
        className="h-10 rounded-md border bg-background px-3 text-sm min-w-[200px]"
      >
        <option value="">\u2014 Unassigned \u2014</option>
        {therapists.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <Button onClick={save} disabled={pending || !dirty} size="sm">
        {pending ? "Saving\u2026" : "Reassign"}
      </Button>
      {saved && (
        <span className="text-sm text-emerald-600 dark:text-emerald-400">
          Reassigned.
        </span>
      )}
      {err && <span className="text-sm text-destructive">{err}</span>}
    </div>
  );
}
