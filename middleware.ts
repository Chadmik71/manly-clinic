import { NextResponse, type NextRequest } from "next/server";
import { CLINIC } from "@/lib/clinic";

/**
 * Maintenance-mode middleware.
 *
 * Toggle by setting MAINTENANCE_MODE="true" in Vercel env vars.
 * No redeploy needed -- Vercel rolls env-var changes onto running
 * deployments automatically within a couple of seconds.
 *
 * Optional env vars while in maintenance mode:
 *   MAINTENANCE_RETURN_DATE  Human-readable date shown on the page
 *                            (e.g. "12 May 2026"). Defaults to "soon".
 *   MAINTENANCE_RETRY_HOURS  Hours from now until search engines and
 *                            uptime monitors should retry. Defaults to 24.
 *
 * Why HTTP 503 + Retry-After (and not a redirect or a 200 page):
 *  - Google reads 503 as a temporary outage and will not deindex
 *    pages, as long as the outage stays under ~7 days.
 *  - Browsers, uptime checkers, and the Wayback Machine all handle
 *    503 correctly. A 200 page would be cached and indexed.
 *  - Retry-After tells crawlers when to come back and stops them
 *    from hammering the site while it is down.
 *
 * Routes that stay live during maintenance:
 *  - /staff/*       so the clinic can manage existing bookings
 *  - /portal/*      so signed-in clients can still see their visits
 *  - /login, /signup
 *  - /api/auth/*    NextAuth endpoints
 *  - /api/cron/*    reminders, scheduled cleanups
 *  - /api/webhooks/* Stripe etc. (when configured)
 *  - /_next/*       framework chunks for the live routes above
 *  - Static SEO files (robots.txt, sitemap.xml, favicons)
 */

const ALLOW_PREFIXES = [
  "/staff",
  "/portal",
  "/login",
  "/signup",
  "/api/auth",
  "/api/cron",
  "/api/webhooks",
  "/_next",
];

const ALLOW_FILES = new Set([
  "/favicon.ico",
  "/favicon.png",
  "/apple-touch-icon.png",
  "/og.png",
  "/robots.txt",
  "/sitemap.xml",
]);

/**
 * HTML-escape values we interpolate into the maintenance page.
 * The values come from CLINIC config (trusted), but escaping is
 * defence-in-depth: it stays correct if those constants ever
 * include an apostrophe, ampersand, or angle bracket.
 */
function htmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}

function maintenanceHtml(returnDate: string): string {
  const e = htmlEscape;
  const fullAddress = `${CLINIC.address.line1}, ${CLINIC.address.suburb} ${CLINIC.address.state} ${CLINIC.address.postcode}`;
  return `<!DOCTYPE html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,follow">
<title>${e(CLINIC.name)} — temporarily offline</title>
<style>
  *,*::before,*::after{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
       background:#f8fafc;color:#0f172a;min-height:100vh;display:grid;place-items:center;padding:1.5rem;line-height:1.5}
  .card{max-width:520px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;
        padding:2rem 1.75rem;box-shadow:0 4px 24px rgba(15,23,42,0.06)}
  h1{font-size:1.5rem;margin:0 0 0.75rem;color:#0d8281;text-align:center}
  p{margin:0.5rem 0}
  .muted{color:#64748b}
  .info{margin-top:1.5rem;padding-top:1.25rem;border-top:1px solid #e2e8f0;font-size:0.95rem}
  .info dt{color:#64748b;font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;margin-top:0.75rem}
  .info dd{margin:0.15rem 0 0;color:#0f172a}
  a{color:#0d8281;text-decoration:none}
  a:hover{text-decoration:underline}
</style>
</head>
<body>
  <main class="card">
    <h1>${e(CLINIC.name)}</h1>
    <p>Our online booking is temporarily offline while we make some improvements.</p>
    <p class="muted">We&rsquo;ll be back ${e(returnDate)}. Existing bookings are unaffected and we&rsquo;re still reachable by phone or email.</p>
    <dl class="info">
      <dt>Phone</dt>
      <dd><a href="tel:${e(CLINIC.phoneE164)}">${e(CLINIC.phone)}</a></dd>
      <dt>Email</dt>
      <dd><a href="mailto:${e(CLINIC.email)}">${e(CLINIC.email)}</a></dd>
      <dt>Address</dt>
      <dd>${e(fullAddress)}</dd>
    </dl>
  </main>
</body>
</html>`;
}

export function middleware(req: NextRequest) {
  if (process.env.MAINTENANCE_MODE !== "true") {
    return NextResponse.next();
  }

  const path = req.nextUrl.pathname;

  // Let staff/portal/auth/cron/webhooks/static through.
  if (ALLOW_FILES.has(path)) {
    return NextResponse.next();
  }
  for (const p of ALLOW_PREFIXES) {
    if (path === p || path.startsWith(p + "/")) {
      return NextResponse.next();
    }
  }

  const returnDate = process.env.MAINTENANCE_RETURN_DATE || "soon";
  const retryHours = Number(process.env.MAINTENANCE_RETRY_HOURS) || 24;
  const retrySeconds = retryHours * 3600;

  return new NextResponse(maintenanceHtml(returnDate), {
    status: 503,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": String(retrySeconds),
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "X-Robots-Tag": "noindex, follow",
    },
  });
}

export const config = {
  // Run on every path EXCEPT Next.js static + image-optimisation
  // assets, so we never accidentally 503 a chunk that the staff
  // portal still needs to render.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
