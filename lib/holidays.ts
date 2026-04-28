// NSW public holidays — verified against
// https://www.nsw.gov.au/about-nsw/public-holidays
//
// We hardcode the dates rather than computing Easter / weekend substitutes
// in code: the NSW Government publishes a definitive list each year, and a
// static lookup is impossible to get wrong. Add future years as the clinic
// continues operating.
//
// Notes on substitutes (NSW Public Holidays Act 2010):
// - When New Year's Day, Christmas Day or Boxing Day fall on a weekend, an
//   additional public holiday is declared for the following Monday or
//   Tuesday (both, when the pair both fall on a weekend).
// - When Australia Day falls on a weekend, the following Monday is the
//   public holiday (no holiday on the Saturday/Sunday).
// - Anzac Day historically had no substitute when it fell on a weekend,
//   but in Feb 2026 the NSW Premier declared additional Monday public
//   holidays for both 2026 (Mon 27 Apr) and 2027 (Mon 26 Apr).

import { CLINIC } from "@/lib/clinic";
import { sydneyDateOf } from "@/lib/time";

const NSW_PUBLIC_HOLIDAYS: Record<string, string> = {
  // 2026
  "2026-01-01": "New Year's Day",
  "2026-01-26": "Australia Day",
  "2026-04-03": "Good Friday",
  "2026-04-04": "Easter Saturday",
  "2026-04-05": "Easter Sunday",
  "2026-04-06": "Easter Monday",
  "2026-04-25": "Anzac Day",
  "2026-04-27": "Additional public holiday (Anzac Day)",
  "2026-06-08": "King's Birthday",
  "2026-10-05": "Labour Day",
  "2026-12-25": "Christmas Day",
  "2026-12-26": "Boxing Day",
  "2026-12-28": "Additional public holiday (Boxing Day)",

  // 2027
  "2027-01-01": "New Year's Day",
  "2027-01-26": "Australia Day",
  "2027-03-26": "Good Friday",
  "2027-03-27": "Easter Saturday",
  "2027-03-28": "Easter Sunday",
  "2027-03-29": "Easter Monday",
  "2027-04-25": "Anzac Day",
  "2027-04-26": "Additional public holiday (Anzac Day)",
  "2027-06-14": "King's Birthday",
  "2027-10-04": "Labour Day",
  "2027-12-25": "Christmas Day",
  "2027-12-26": "Boxing Day",
  "2027-12-27": "Additional public holiday (Christmas Day)",
  "2027-12-28": "Additional public holiday (Boxing Day)",
};

/** Returns the holiday name if `sydneyDateISO` (YYYY-MM-DD) is a NSW public
 * holiday, otherwise null. */
export function getHolidayName(sydneyDateISO: string): string | null {
  return NSW_PUBLIC_HOLIDAYS[sydneyDateISO] ?? null;
}

/** Convenience: takes a Date, resolves the Sydney calendar date, and returns
 * the holiday name (or null). */
export function getHolidayNameForDate(date: Date): string | null {
  return getHolidayName(sydneyDateOf(date));
}

export function isPublicHoliday(date: Date): boolean {
  return getHolidayNameForDate(date) !== null;
}

export type HolidayPriceBreakdown = {
  basePriceCents: number;
  surchargeCents: number;
  finalPriceCents: number;
  surchargePct: number;
  holidayName: string | null;
};

/**
 * Apply the clinic-wide public-holiday surcharge to a price for a booking
 * starting at `startsAt`. Rounding is half-up to the nearest cent so e.g.
 * $20.00 + 10% = $22.00 (not $21.99).
 */
export function applyHolidaySurcharge(
  basePriceCents: number,
  startsAt: Date,
): HolidayPriceBreakdown {
  const holidayName = getHolidayNameForDate(startsAt);
  if (!holidayName) {
    return {
      basePriceCents,
      surchargeCents: 0,
      finalPriceCents: basePriceCents,
      surchargePct: 0,
      holidayName: null,
    };
  }
  const pct = CLINIC.publicHolidaySurchargePct;
  const surchargeCents = Math.round((basePriceCents * pct) / 100);
  return {
    basePriceCents,
    surchargeCents,
    finalPriceCents: basePriceCents + surchargeCents,
    surchargePct: pct,
    holidayName,
  };
}
