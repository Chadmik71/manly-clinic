// Compares two full medical forms (IntakeForm rows with medical answers) so
// staff can see what a returning client changed since their last form, e.g.
// a new medication or allergy. Pure functions, safe for any component.
//
// Only safety-relevant, slow-changing sections are compared. The presenting
// complaint (pain location/scale/onset/history, treatment goals) is expected
// to differ every visit, and emergency-contact edits aren't clinical.

import { historyLabel, parseHistory } from "@/lib/intake";

export type IntakeForCompare = {
  medicalHistory: string | null;
  medicalConditions: string | null;
  medications: string | null;
  allergies: string | null;
  injuries: string | null;
  pregnancy: boolean | null;
};

export type IntakeChange = {
  /** Section name staff recognise, e.g. "Medications". */
  label: string;
  before: string;
  after: string;
};

const TEXT_FIELDS = [
  ["medicalConditions", "Medical conditions"],
  ["medications", "Medications"],
  ["allergies", "Allergies"],
  ["injuries", "Injuries / areas to avoid"],
] as const;

// Answers that all mean "nothing to report", so "None" -> "nil" isn't a change.
const EMPTY_ANSWERS = new Set(["", "none", "nil", "n/a", "na", "no", "nothing", "-"]);

function normalise(v: string | null): string {
  const s = (v ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[.]+$/, "");
  return EMPTY_ANSWERS.has(s) ? "" : s;
}

function display(v: string | null): string {
  const s = (v ?? "").trim();
  return normalise(v) === "" ? "None" : s;
}

/** What changed from `prev` to `curr`. Empty array when nothing did. */
export function diffIntakes(prev: IntakeForCompare, curr: IntakeForCompare): IntakeChange[] {
  const changes: IntakeChange[] = [];

  const before = new Set(parseHistory(prev.medicalHistory));
  const after = new Set(parseHistory(curr.medicalHistory));
  const added = [...after].filter((c) => !before.has(c)).map(historyLabel);
  const removed = [...before].filter((c) => !after.has(c)).map(historyLabel);
  if (added.length || removed.length) {
    changes.push({
      label: "Medical history",
      before: removed.length ? `Removed: ${removed.join(", ")}` : "—",
      after: added.length ? `Added: ${added.join(", ")}` : "—",
    });
  }

  for (const [key, label] of TEXT_FIELDS) {
    if (normalise(prev[key]) !== normalise(curr[key])) {
      changes.push({ label, before: display(prev[key]), after: display(curr[key]) });
    }
  }

  if (!!prev.pregnancy !== !!curr.pregnancy) {
    changes.push({
      label: "Pregnancy",
      before: prev.pregnancy ? "Pregnant" : "Not pregnant",
      after: curr.pregnancy ? "Pregnant" : "Not pregnant",
    });
  }

  return changes;
}
