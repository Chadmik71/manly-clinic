import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";
import { CLINIC } from "@/lib/clinic";

const { auth } = NextAuth(authConfig);

// Paths that remain reachable while maintenance mode is on.
// Lets staff/clients log in, lets cron jobs and webhooks still fire,
// and lets NextAuth handle its own /api/auth callbacks.
const MAINTENANCE_ALLOW_PREFIXES = [
  "/staff",
  "/portal",
  "/login",
  "/signup",
  "/api/auth",
  "/api/cron",
  // Stripe webhook lives at /api/stripe/webhook. The /api/webhooks prefix
  // is kept for any future webhook routes (Twilio status callbacks, etc.).
  "/api/stripe/webhook",
  "/api/webhooks",
];

const MAINTENANCE_ALLOW_FILES = new Set([
  "/favicon.ico",
  "/favicon.png",
  "/apple-touch-icon.png",
  "/og.png",
  "/robots.txt",
  "/sitemap.xml",
]);

function isMaintenanceAllowed(pathname: string): boolean {
  if (MAINTENANCE_ALLOW_FILES.has(pathname)) return true;
  return MAINTENANCE_ALLOW_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function maintenanceHtml(): string {
  const returnDate = process.env.MAINTENANCE_RETURN_DATE || "";
  const returnLine = returnDate
    ? `<p>We expect to be back online by <strong>${htmlEscape(returnDate)}</strong>.</p>`
    : `<p>We expect to be back online shortly.</p>`;
  const address = `${CLINIC.address.line1}, ${CLINIC.address.suburb} ${CLINIC.address.state} ${CLINIC.address.postcode}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${htmlEscape(CLINIC.name)} — Temporarily Closed</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; max-width: 640px; margin: 4rem auto; padding: 0 1.5rem; color: #1a1a1a; line-height: 1.6; }
  h1 { font-size: 1.75rem; margin-bottom: 0.5rem; }
  .lede { color: #555; margin-bottom: 1.5rem; }
  .contact { background: #f5f5f5; border-radius: 8px; padding: 1.25rem 1.5rem; margin-top: 2rem; }
  .contact h2 { font-size: 1rem; margin-top: 0; margin-bottom: 0.75rem; color: #333; }
  .contact p { margin: 0.25rem 0; }
  a { color: #0066cc; text-decoration: none; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
  <h1>${htmlEscape(CLINIC.name)}</h1>
  <p class="lede">Our website is temporarily offline for maintenance.</p>
  ${returnLine}
  <div class="contact">
    <h2>Need to reach us?</h2>
    <p>Phone: <a href="tel:${htmlEscape(CLINIC.phoneE164)}">${htmlEscape(CLINIC.phone)}</a></p>
    <p>Email: <a href="mailto:${htmlEscape(CLINIC.email)}">${htmlEscape(CLINIC.email)}</a></p>
    <p>${htmlEscape(address)}</p>
  </div>
</body>
</html>`;
}

function maintenanceResponse(): NextResponse {
  const retryHours = Number(process.env.MAINTENANCE_RETRY_HOURS || "24");
  const retrySeconds = Math.max(60, Math.round(retryHours * 3600));
  return new NextResponse(maintenanceHtml(), {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "Retry-After": String(retrySeconds),
    },
  });
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Maintenance mode — checked first, before any auth redirects.
  if (
    process.env.MAINTENANCE_MODE === "true" &&
    !isMaintenanceAllowed(pathname)
  ) {
    // Logged-in staff/admin bypass maintenance so they can preview the live
    // public site on the real domain while the public sees the "temporarily
    // offline" page. The /login route itself is already allow-listed above.
    const role = session?.user?.role;
    const staffPreview = role === "STAFF" || role === "ADMIN";
    if (!staffPreview) {
      return maintenanceResponse();
    }
  }

  // Existing auth logic for /portal and /staff.
  const protectedPrefix = ["/portal", "/staff"];
  const requiresAuth = protectedPrefix.some((p) => pathname.startsWith(p));
  if (requiresAuth && !session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/staff")) {
    const role = session?.user?.role;
    if (role !== "STAFF" && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/).*)"],
};
