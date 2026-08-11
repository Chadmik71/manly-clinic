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
  placeholder?: string;
  chips?: string[];
  // "sentence" chips are whole sentences (already end with a period) joined
  // with a space; "list" chips are short terms joined with a comma. Defaults
  // to "list" when omitted.
  chipJoin?: "sentence" | "list";
}> = [
  {
    key: "subjective",
    label: "Subjective",
    hint: "What the client reports — presenting complaint, onset, history, goals. Click sentences below to build the note, then edit as needed.",
    rows: 4,
    placeholder:
      "e.g. Client reports ongoing tightness across shoulders and neck, worse after long hours at a desk. Denies numbness or tingling. Goal: reduce tension, improve mobility.",
    chipJoin: "sentence",
    chips: [
      "Client reports lower back pain.",
      "Client reports neck and shoulder tightness.",
      "Client reports tension headaches.",
      "Client reports stress and general tension.",
      "Client reports pain is worse after sitting at a desk.",
      "Client reports poor sleep due to discomfort.",
      "First time receiving massage treatment.",
      "Regular client, routine maintenance session.",
      "No new complaints since last visit.",
      "Pain has improved since last visit.",
    ],
  },
  {
    key: "objective",
    label: "Objective",
    hint: "Findings on examination — palpation, range of motion, posture, tests. Click sentences below to build the note, then edit as needed.",
    rows: 4,
    placeholder:
      "e.g. Palpable hypertonicity in upper trapezius and levator scapulae bilaterally. Reduced cervical rotation to the right. No swelling or bruising noted.",
    chipJoin: "sentence",
    chips: [
      "Hypertonicity (tightness) noted in upper trapezius.",
      "Hypertonicity noted in lower back muscles.",
      "Reduced range of motion in the neck.",
      "Reduced range of motion in the shoulders.",
      "Tender points found on palpation.",
      "Postural imbalance observed.",
      "No swelling or bruising present.",
      "Mild inflammation noted.",
      "Muscle tightness on both sides (bilateral).",
      "Normal range of motion.",
    ],
  },
  {
    key: "assessment",
    label: "Assessment",
    hint: "Clinical reasoning. Working hypothesis or contributing factors. Click sentences below to build the note, then edit as needed.",
    rows: 3,
    placeholder:
      "e.g. Presentation consistent with postural strain from prolonged sitting. Muscular tension likely contributing to reduced range of motion.",
    chipJoin: "sentence",
    chips: [
      "Consistent with muscle tension from desk work.",
      "Consistent with poor posture.",
      "Consistent with repetitive strain / overuse.",
      "Likely stress-related muscle tension.",
      "Condition improving compared to last visit.",
      "Chronic tightness, needs ongoing treatment.",
      "Recent (acute) strain.",
      "No signs treatment should be avoided (no contraindications).",
    ],
  },
  {
    key: "plan",
    label: "Plan",
    hint: "Treatment provided this session, next visit, home-care advice. Click sentences below to build the note, then edit as needed.",
    rows: 4,
    placeholder:
      "e.g. Continued remedial massage focusing on neck/shoulders, fortnightly. Advised stretching and posture breaks. Review in 2 weeks.",
    chipJoin: "sentence",
    chips: [
      "Continue remedial massage, weekly.",
      "Continue remedial massage, every two weeks.",
      "Follow-up appointment in 2 weeks.",
      "Follow-up appointment in 4 weeks.",
      "Advised stretching exercises at home.",
      "Advised regular posture breaks at work.",
      "Advised drinking more water after treatment.",
      "Recommend seeing a doctor or physio if no improvement.",
      "Advised applying heat or ice at home if needed.",
      "Client to monitor symptoms and report any changes.",
    ],
  },
  {
    key: "areasTreated",
    label: "Areas treated",
    hint: "Body regions worked on (e.g. lumbar paraspinals, upper trapezius). Click a chip to add it, or type your own.",
    rows: 2,
    placeholder: "e.g. Neck, upper trapezius, lower back",
    chips: [
      "Neck & shoulders",
      "Upper trapezius",
      "Upper back / thoracic",
      "Lower back (lumbar)",
      "Glutes & hips",
      "Hamstrings",
      "Calves",
      "Forearms & hands",
      "Feet",
      "Full body",
    ],
  },
  {
    key: "techniques",
    label: "Techniques",
    hint: "Modalities used (e.g. Swedish, deep tissue, trigger point, MFR). Click a chip to add it, or type your own.",
    rows: 2,
    placeholder: "e.g. Swedish, deep tissue, trigger point release",
    chips: [
      "Swedish",
      "Deep tissue",
      "Remedial",
      "Trigger point therapy",
      "Myofascial release (MFR)",
      "Thai stretching",
      "Sports massage",
      "Cupping",
      "Hot stone",
      "Lymphatic drainage",
    ],
  },
  {
    key: "outcome",
    label: "Outcome",
    hint: "Client's response and any progress vs prior visit.",
    rows: 2,
    placeholder:
      "e.g. Client reported reduced tightness and improved range of motion by end of session. Tolerated pressure well.",
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

  function addChip(key: keyof ClinicalNotes, phrase: string) {
    const isSentence = FIELDS.find((f) => f.key === key)?.chipJoin === "sentence";
    setNotes((prev) => {
      const current = prev[key].trim();
      if (!current) return { ...prev, [key]: phrase };
      if (current.toLowerCase().includes(phrase.toLowerCase())) return prev;
      const joiner = isSentence ? " " : ", ";
      return { ...prev, [key]: `${current}${joiner}${phrase}` };
    });
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
          {f.chips && (
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              {f.chips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  disabled={pending}
                  onClick={() => addChip(f.key, chip)}
                  className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  {chip}
                </button>
              ))}
            </div>
          )}
          <textarea
            id={`note-${f.key}`}
            value={notes[f.key]}
            onChange={(e) => update(f.key, e.target.value)}
            disabled={pending}
            rows={f.rows}
            placeholder={f.placeholder}
            className="w-full rounded-md border bg-background p-2 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/60 placeholder:font-sans"
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
            Last edited by {authorName ?? "unknown"} {"\u00b7"}{" "}
            {fmt.format(new Date(updatedAt))}
          </span>
        )}
      </div>
    </div>
  );
}
