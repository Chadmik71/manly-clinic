// Single source of truth for clinic-wide content.
// Update these and all pages reflect the change.

export const CLINIC = {
  name: "Manly Remedial Clinic",
  tagline: "Evidence-based remedial therapy on Sydney's Northern Beaches",
  address: {
    line1: "Shop 2, 31 Belgrave St",
    suburb: "Manly",
    state: "NSW",
    postcode: "2095",
  },
  phone: "0412 822 226",
  phoneE164: "+61412822226",
  email: "manlyremedialthai@gmail.com",
  hours: "7 days, 9:00 am – 8:00 pm",
  publicHolidaySurchargePct: 10,
  // Australian Privacy Act / APP context
  abn: "82 669 994 183",
  legalName: "Manly Remedial Clinic Pty Ltd",
  privacyOfficerEmail: "privacy@manlyremedialthai.com.au",
  domain: "https://manlyremedialthai.com.au",
} as const;

// Cancellation policy
export const CANCEL_FEE_THRESHOLD_HOURS = 24;
export const CANCEL_FEE_PERCENT = 50; // % of price charged when cancelled inside the threshold

// Clinic-wide booking policy. All sessions must finish by this time
// (minutes from midnight). Enforced in lib/booking.ts (slot calc)
// and in the createBooking server action (server-side validation).
export const BOOKING_LATEST_END_MIN = 20 * 60; // 8:00 pm
export const BOOKING_EARLIEST_START_MIN = 9 * 60; // 9:00 am
