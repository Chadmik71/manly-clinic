import { ImageResponse } from "next/og";
import { CLINIC } from "@/lib/clinic";

/**
 * Dynamically generated social/AI preview card served at /og.png.
 *
 * Referenced by the root metadata (openGraph/twitter images) and the
 * MedicalBusiness JSON-LD on the homepage. Generating it here means there's
 * no binary asset to maintain — the card always reflects CLINIC. 1200×630 is
 * the standard OpenGraph size used by Google, Facebook, iMessage, Slack, X.
 */

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Cache the generated PNG aggressively — the content rarely changes.
export const revalidate = 86400;

export function GET() {
  const teal = "#14b8a6";
  const dark = "#0f172a";
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: `linear-gradient(135deg, ${dark} 0%, #134e4a 100%)`,
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            fontSize: 30,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: teal,
            fontWeight: 700,
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 999,
              background: teal,
            }}
          />
          {CLINIC.address.suburb} · {CLINIC.address.state}
        </div>
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            lineHeight: 1.05,
            marginTop: 24,
            maxWidth: 980,
          }}
        >
          {CLINIC.name}
        </div>
        <div
          style={{
            fontSize: 38,
            color: "#cbd5e1",
            marginTop: 28,
            maxWidth: 980,
            lineHeight: 1.3,
          }}
        >
          {CLINIC.tagline}
        </div>
        <div
          style={{
            fontSize: 28,
            color: "#94a3b8",
            marginTop: 48,
            display: "flex",
            gap: "28px",
          }}
        >
          <span>Open 7 days</span>
          <span>·</span>
          <span>Health-fund rebates</span>
          <span>·</span>
          <span>{CLINIC.phone}</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
