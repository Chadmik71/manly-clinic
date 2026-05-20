"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Therapist = { id: string; name: string; isActive: boolean };

type Preset = {
  label: string;
  reason: string;
  fromTime: string;
  toTime: string;
};

// Match the wording / times used by the existing per-therapist quick-actions
// menu (components/therapist-quick-actions.tsx) so the two paths stay
// consistent for the admin.
const PRESETS: Preset[] = [
  { label: "Lunch (12 – 1pm)", reason: "Lunch", fromTime: "12:00", toTime: "13:00" },
  { label: "Late start (until 11am)", reason: "Late start", fromTime: "09:00", toTime: "11:00" },
  { label: "Early finish (from 4pm)", reason: "Early finish", fromTime: "16:00", toTime: "20:30" },
];

export function BlockTimeDialog({
  therapists,
  dateStr,
  addTimeOffAction,
}: {
  therapists: Therapist[];
  /** Sydney YYYY-MM-DD that the schedule is currently displaying. */
  dateStr: string;
  addTimeOffAction: (
    fd: FormData,
  ) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Default to the first active therapist; admin can change.
  const firstActive = therapists.find((t) => t.isActive)?.id ?? therapists[0]?.id ?? "";
  const [therapistId, setTherapistId] = useState(firstActive);
  const [date, setDate] = useState(dateStr);
  const [fromTime, setFromTime] = useState("12:00");
  const [toTime, setToTime] = useState("13:00");
  const [reason, setReason] = useState("Lunch");

  function applyPreset(p: Preset) {
    setFromTime(p.fromTime);
    setToTime(p.toTime);
    setReason(p.reason);
    setError(null);
  }

  function reset() {
    setTherapistId(firstActive);
    setDate(dateStr);
    setFromTime("12:00");
    setToTime("13:00");
    setReason("Lunch");
    setError(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  function submit() {
    setError(null);
    if (!therapistId) {
      setError("Pick a therapist.");
      return;
    }
    const [fH, fM] = fromTime.split(":").map(Number);
    const [tH, tM] = toTime.split(":").map(Number);
    if (
      Number.isNaN(fH) || Number.isNaN(fM) ||
      Number.isNaN(tH) || Number.isNaN(tM)
    ) {
      setError("Invalid time.");
      return;
    }
    if (tH * 60 + tM <= fH * 60 + fM) {
      setError("End must be after start.");
      return;
    }
    const fd = new FormData();
    fd.set("therapistId", therapistId);
    fd.set("startsAt", `${date}T${fromTime}`);
    fd.set("endsAt", `${date}T${toTime}`);
    fd.set("reason", reason);
    start(async () => {
      const res = await addTimeOffAction(fd);
      if (res.error) {
        setError(res.error);
      } else {
        close();
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Ban className="h-4 w-4 mr-1.5" />
        Block time
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold">Block time</h2>
        <p className="text-xs text-muted-foreground">
          Blocked time hides this therapist&rsquo;s affected slots from
          customers and shows as a grey bar on the schedule.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="bt-therapist">Therapist</Label>
          <select
            id="bt-therapist"
            value={therapistId}
            onChange={(e) => setTherapistId(e.target.value)}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            {therapists.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {t.isActive ? "" : " (inactive)"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-1.5">Quick presets</p>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Button
                key={p.label}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => applyPreset(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="bt-date" className="text-xs">Date</Label>
            <Input
              id="bt-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bt-from" className="text-xs">From</Label>
            <Input
              id="bt-from"
              type="time"
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bt-to" className="text-xs">To</Label>
            <Input
              id="bt-to"
              type="time"
              value={toTime}
              onChange={(e) => setToTime(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="bt-reason" className="text-xs">Reason</Label>
          <Input
            id="bt-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Lunch, Personal, Annual leave"
            maxLength={500}
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2 pt-2">
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Blocking…" : "Block time"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={close}
            disabled={pending}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
