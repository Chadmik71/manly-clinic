// Clients without a real email on file get a made-up unique address, because
// User.email is required and unique:
//   imported-<id>@manlyremedialthai.com.au  (old-system import, scripts/import-customers.ts)
//   walkin-<id>@clinic.local                (staff phone/walk-in booking with no email)
// Nothing should be emailed to these, and staff should be able to replace
// them with the client's real address.

const PLACEHOLDER_EMAIL_RE =
  /^(imported-[^@]+@manlyremedialthai\.com\.au|walkin-[^@]+@clinic\.local)$/i;

export function isPlaceholderEmail(email: string | null | undefined): boolean {
  return !!email && PLACEHOLDER_EMAIL_RE.test(email.trim());
}
