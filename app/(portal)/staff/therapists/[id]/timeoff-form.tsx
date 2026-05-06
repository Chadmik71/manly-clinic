"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Format a Date as a value compatible with <input type="datetime-local">.
// datetime-local uses the BROWSER's local timezone — for our Australian
// admins this is Sydney, which matches the rest of the app's TZ assumptions.
function toDateTimeLocal(date: Date): string {
  const yr = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const dy = String(date.getDate()).padStart(2, "0");
  const hr = String(date.getHours()).padStart(2, "0");
  const mn = String(date.getMinutes()).padStart(2, "0");
  return `${yr}-${mo}-${dy}T${hr}:${mn}`;
}

type Preset = {
  label: string;
  reason: string;
  compute: (now: Date) => { from: Date; to: Date };
};

const PRESETS: Preset[] = [
  {
    label: "Today's lunch (12–1pm)",
    reason: "Lunch",
    compute: (now) => {
      const f = new Date(now); f.setHours(12, 0, 0, 0);
      const t = new Date(now); t.setHours(13, 0, 0, 0);
      return { from: f, to: t };
    },
  },
  {
    label: "Tomorrow's lunch (12–1pm)",
    reason: "Lunch",
    compute: (now) => {
      const f = new Date(now); f.setDate(f.getDate() + 1); f.setHours(12, 0, 0, 0);
      const t = new Date(now); t.setDate(t.getDate() + 1); t.setHours(13, 0, 0, 0);
      return { from: f, to: t };
    },
  },
  {
    label: "Late start today (until 11am)",
    reason: "Late start",
    compute: (now) => {
      const f = new Date(now); f.setHours(9, 0, 0, 0);
      const t = new Date(now); t.setHours(11, 0, 0, 0);
      return { from: f, to: t };
    },
  },
  {
    label: "Early finish today (from 4pm)",
    reason: "Early finish",
    compute: (now) => {
      const f = new Date(now); f.setHours(16, 0, 0, 0);
      const t = new Date(now); t.setHours(20, 30, 0, 0);
      return { from: f, to: t };
    },
  },
];

export function TimeOffForm({
  addAction,
  therapistId,
}: {
  addAction: (
    formData: FormData,
  ) => Promise<{ ok?: boolean; error?: string }>;
  therapistId: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");

  function applyPreset(preset: Preset) {
    const now = new Date();
    const { from, to } = preset.compute(now);
    setStartsAt(toDateTimeLocal(from));
    setEndsAt(toDateTimeLocal(to));
    setReason(preset.reason);
    setMsg(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    fd.set("therapistId", therapistId);
    start(async () => {
      const res = await addAction(fd);
      setMsg(res);
      if (res.ok) {
        setStartsAt("");
        setEndsAt("");
        setReason("");
      }
    });
  }

  return (
    <div className="space-y-3">
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

      <form
        onSubmit={onSubmit}
        className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] items-end"
      >
        <div className="space-y-1.5">
          <Label htmlFor="startsAt" className="text-xs">From</Label>
          <Input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            required
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endsAt" className="text-xs">To</Label>
          <Input
            id="endsAt"
            name="endsAt"
            type="datetime-local"
            required
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="reason" className="text-xs">Reason (optional)</Label>
          <Input
            id="reason"
            name="reason"
            placeholder="e.g. Annual leave, Lunch, Late start"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
        {msg?.error && (
          <p className="sm:col-span-4 text-sm text-destructive">{msg.error}</p>
        )}
      </form>
    </div>
  );
}
