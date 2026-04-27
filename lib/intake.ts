// Shared intake form constants — used by the booking confirm form and the
// portal/staff display so labels stay consistent.

export const MEDICAL_HISTORY_GROUPS = [
  {
    label: "Cardiovascular",
    items: [
      { code: "high_bp", label: "High blood pressure" },
      { code: "low_bp", label: "Low blood pressure" },
      { code: "heart_disease", label: "Heart disease / cardiac condition" },
      { code: "varicose_veins", label: "Varicose veins" },
      { code: "dvt", label: "DVT / blood clots" },
    ],
  },
  {
    label: "Neurological",
    items: [
      { code: "stroke_tia", label: "Stroke / TIA" },
      { code: "epilepsy", label: "Epilepsy / seizures" },
      { code: "migraines", label: "Migraines / chronic headaches" },
      { code: "ms", label: "Multiple sclerosis" },
      { code: "neuropathy", label: "Neuropathy / nerve damage" },
    ],
  },
  {
    label: "Musculoskeletal",
    items: [
      { code: "arthritis", label: "Arthritis (rheumatoid / osteo)" },
      { code: "osteoporosis", label: "Osteoporosis" },
      { code: "recent_surgery", label: "Surgery in past 6 months" },
      { code: "recent_fracture", label: "Fracture in past 6 months" },
      { code: "disc_injury", label: "Disc injury / sciatica" },
    ],
  },
  {
    label: "Other",
    items: [
      { code: "diabetes", label: "Diabetes" },
      { code: "cancer", label: "Cancer (current or past 5 yrs)" },
      { code: "asthma", label: "Asthma / respiratory" },
      { code: "skin_condition", label: "Skin condition / infection" },
      { code: "bleeding_disorder", label: "Bleeding / clotting disorder" },
      { code: "blood_thinners", label: "Currently on blood thinners" },
      { code: "anxiety_depression", label: "Anxiety or depression" },
    ],
  },
] as const;

export const ALL_HISTORY_CODES = MEDICAL_HISTORY_GROUPS.flatMap((g) =>
  g.items.map((i) => i.code),
);

export function historyLabel(code: string): string {
  for (const g of MEDICAL_HISTORY_GROUPS) {
    const match = g.items.find((i) => i.code === code);
    if (match) return match.label;
  }
  return code;
}

export function parseHistory(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr))
      return arr.filter((s): s is string => typeof s === "string");
  } catch {
    // ignore
  }
  return [];
}

export const AU_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"];
export const GENDER_OPTIONS = [
  { value: "FEMALE", label: "Female" },
  { value: "MALE", label: "Male" },
  { value: "OTHER", label: "Other" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
];
