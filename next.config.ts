import type { NextConfig } from "next";

/**
 * Security headers applied to every response. These are deliberately
 * conservative -- strong enough to defend against the common web threats
 * (clickjacking, MIME sniffing, downgrade attacks, browser-side feature
 * abuse) without breaking Next.js, Tailwind, or the embedded Google
 * reviews photos.
 */

/**
 * Content-Security-Policy. Scripts may only come from this site, Stripe
 * (card form) and Vercel Analytics; no plugins, no <base> hijack, forms
 * only post back here, and nobody can frame the site. Next.js renders an
 * inline bootstrap script, so script-src keeps 'unsafe-inline' (a nonce CSP
 * would force every page to render dynamically). Google review photos and
 * other https images are allowed. Dev adds 'unsafe-eval' + websockets for
 * React Refresh / HMR.
 */
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://js.stripe.com https://va.vercel-scripts.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.stripe.com https://*.stripe.network https://va.vercel-scripts.com${isDev ? " ws: wss:" : ""}`,
  "frame-src https://js.stripe.com https://hooks.stripe.com https://*.stripe.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Force HTTPS for two years, including subdomains, and signal preload
  // eligibility (submit the domain at hstspreload.org to lock it in).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Disallow framing entirely. Prevents clickjacking; we never embed
  // the clinic site in third-party iframes.
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  // Stop browsers from MIME-sniffing responses; protects against
  // confusion attacks where a non-script blob gets executed.
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  // Send the origin (not the path) on cross-origin navigations; keeps
  // patient-portal URL paths out of upstream referrer logs.
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  // Disable browser features the clinic site does not use. Both the
  // legacy interest-cohort (FLoC) and the newer browsing-topics signal
  // are switched off so the site does not participate in ad-cohort
  // tracking.
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=(), usb=(), magnetometer=(), gyroscope=()",
  },
  // Allow DNS prefetch -- modest perf win for outbound resources
  // (Google reviewer profile photos, in particular).
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
];

const config: NextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework (and so its version's known issues) in
  // an X-Powered-By header on every response.
  poweredByHeader: false,
  typedRoutes: false,
  // pdfkit needs runtime access to its bundled .afm font files; Next bundling
  // rewrites the paths, so load it from node_modules at runtime.
  serverExternalPackages: ["pdfkit"],
  async headers() {
    return [
      {
        // Apply on every route, including API handlers.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default config;
