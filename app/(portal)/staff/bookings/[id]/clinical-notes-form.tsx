"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

// Keep prop shape in sync with ClinicalNotesInput in actions.ts.
export interface ClinicalNotes {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  areasTreated: string;
  techniques: string;
  outcome: string;
}

const FIELDS: Array<{
  key: keyof ClinicalNotes;
  label: string;
  hint: string;
  rows: number;
}> = [
  {
    key: "subjective",
    label: "Subjective",
    hint: "What the client reports — presenting complaint, onset, history, goals.",
    rows: 3,
  },
  {
    key: "objective",
    label: "Objective",
    hint: "Findings on examination — palpation, range of motion, posture, tests.",
    rows: 3,
  },
  {
    key: "assessment",
    label: "Assessment",
    hint: "Clinical reasoning. Working hypothesis or contributing factors.",
    rows: 2,
  },
  {
    key: "plan",
    label: "Plan",
    hint: "Treatment provided this session, next visit, home-care advice.",
    rows: 3,
  },
  {
    key: "areasTreated",
    label: "Areas treated",
    hint: "Body regions worked on (e.g. lumbar paraspinals, upper trapezius).",
    rows: 2,
  },
  {
    key: "techniques",
    label: "Techniques",
    hint: "Modalities used (e.g. Swedish, deep tissue, trigger point, MFR).",
    rows: 2,
  },
  {
    key: "outcome",
    label: "Outcome",
    hint: "Client's response and any progress vs prior visit.",
    rows: 2,
  },
];

const fmt = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  dateStyle: "medium",
  timeStyle: "short",
});

export function ClinicalNotesForm({
  bookingId,
  initial,
  authorName,
  updatedAt,
  action,
}: {
  bookingId: string;
  initial: ClinicalNotes;
  authorName: string | null;
  updatedAt: Date | null;
  action: (
    id: string,
    notes: ClinicalNotes,
  ) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [notes, setNotes] = useState<ClinicalNotes>(initial);
  const [dirty, setDirty] = useState(false);

  function update(key: keyof ClinicalNotes, value: string) {
    setNotes((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
    setDirty(true);
  }

  function save() {
    setErr(null);
    setSaved(false);
    start(async () => {
      const r = await action(bookingId, notes);
      if (r?.error) {
        setErr(r.error);
      } else {
        setSaved(true);
        setDirty(false);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      {FIELDS.map((f) => (
        <div key={f.key}>
          <label
            htmlFor={`note-${f.key}`}
            className="block text-sm font-medium"
          >
            {f.label}
          </label>
          <p className="text-xs text-muted-foreground mb-1.5">{f.hint}</p>
          <textarea
            id={`note-${f.key}`}
            value={notes[f.key]}
            onChange={(e) => update(f.key, e.target.value)}
            disabled={pending}
            rows={f.rows}
            className="w-full rounded-md border bg-background p-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
        <Button onClick={save} disabled={pending || !dirty} size="sm">
          {pending ? "Saving\u2026" : "Save notes"}
        </Button>
        {saved && (
          <span className="text-sm text-emerald-600 dark:text-emerald-400">
            Saved.
          </span>
        )}
        {err && <span className="text-sm text-destructive">{err}</span>}
        {updatedAt && (
          <span className="ml-auto text-xs text-muted-foreground">
            Last edited by {authorName ?? "unknown"} \u00b7{" "}
            {fmt.format(new Date(updatedAt))}
          </span>
        )}
      </div>
    </div>
  );
}
