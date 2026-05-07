import type { NextConfig } from "next";

/**
 * Security headers applied to every response. These are deliberately
 * conservative -- strong enough to defend against the common web threats
 * (clickjacking, MIME sniffing, downgrade attacks, browser-side feature
 * abuse) without breaking Next.js, Tailwind, or the embedded Google
 * reviews photos. CSP is intentionally NOT set here yet -- Next.js needs
 * nonces or unsafe-inline to render its inline runtime, and a strict
 * CSP requires per-deploy verification. Add it as a follow-up when there
 * is time to test it properly.
 */
const securityHeaders = [
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
