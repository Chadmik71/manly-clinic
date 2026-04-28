// Australian phone normalisation.
//
// Originally lived inline in scripts/import-customers.ts; lifted here so
// signup, guest checkout and customer-lookup all use the same canonical
// form. The 4,200 imported customer records were normalised with this
// logic, so any matching done at booking time must match it byte-for-byte.
//
// Canonical form: a 10-digit Australian mobile starting "04", e.g. "0412345678".
// Anything we don't recognise (landline, international non-AU, garbage) is
// returned with whitespace and dashes stripped — better than throwing.

export function normalisePhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const cleaned = raw.replace(/[\s\-]/g, "");
  if (/^\+614\d{8}$/.test(cleaned)) return "0" + cleaned.slice(3);
  if (/^614\d{8}$/.test(cleaned)) return "0" + cleaned.slice(2);
  return cleaned;
}

/** True if the value looks like an Australian mobile (10 digits starting "04"). */
export function isAuMobile(p: string): boolean {
  return /^04\d{8}$/.test(p);
}
