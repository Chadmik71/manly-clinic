"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function minToHHMM(m: number): string {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function hhmmToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function AvailabilityForm({
  action,
  therapistId,
  availability,
}: {
  action: (
    formData: FormData,
  ) => Promise<{ ok?: boolean; error?: string }>;
  therapistId: string;
  availability: { dayOfWeek: number; startMin: number; endMin: number }[];
}) {
  const initial = DAYS.map((_, i) => {
    const a = availability.find((x) => x.dayOfWeek === i);
    return {
      working: !!a,
      start: a ? minToHHMM(a.startMin) : "09:00",
      end: a ? minToHHMM(a.endMin) : "20:00",
    };
  });
  const [rows, setRows] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);

  function update(i: number, patch: Partial<(typeof initial)[number]>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData();
    fd.set("therapistId", therapistId);
    rows.forEach((row, i) => {
      if (row.working) {
        fd.append(
          "slots",
          `${i}|${hhmmToMin(row.start)}|${hhmmToMin(row.end)}`,
        );
      }
    });
    start(async () => {
      const res = await action(fd);
      setMsg(res);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <div className="space-y-1">
        {rows.map((row, i) => (
          <div
            key={i}
            className="grid grid-cols-[60px_auto_1fr_auto_1fr] items-center gap-2 text-sm"
          >
            <span className="font-medium">{DAYS[i]}</span>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={row.working}
                onChange={(e) => update(i, { working: e.target.checked })}
              />
              On
            </label>
            <input
              type="time"
              value={row.start}
              disabled={!row.working}
              onChange={(e) => update(i, { start: e.target.value })}
              className="h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-50"
            />
            <span className="text-muted-foreground">→</span>
            <input
              type="time"
              value={row.end}
              disabled={!row.working}
              onChange={(e) => update(i, { end: e.target.value })}
              className="h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-50"
            />
          </div>
        ))}
      </div>
      {msg?.error && <p className="text-sm text-destructive mt-2">{msg.error}</p>}
      {msg?.ok && <p className="text-sm text-emerald-600 mt-2">Saved.</p>}
      <Button type="submit" disabled={pending} className="mt-2">
        {pending ? "Saving…" : "Save availability"}
      </Button>
    </form>
  );
}
