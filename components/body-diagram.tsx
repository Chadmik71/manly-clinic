"use client";

import { useState, useMemo } from "react";
import {
  FRONT_ZONES,
  BACK_ZONES,
  zoneLabel,
  type Zone,
} from "@/lib/body-diagram-zones";

/**
 * Body diagram with clickable zones for the intake form.
 *
 * Renders a simplified front + back human silhouette in a single SVG with
 * clickable circle markers at each anatomical region. Selected zones are
 * highlighted in red and exposed via onChange as an array of stable string
 * codes (the same codes are stored on IntakeForm.painLocationCodes so
 * returning customers see their previous selection).
 *
 * Zone definitions and the `zoneLabel` lookup live in
 * `@/lib/body-diagram-zones` so server components (staff intake viewer,
 * intake history) can resolve codes without dragging in this client module.
 *
 * Re-exported here for backward compat with existing imports.
 */
export { zoneLabel };

type Props = {
  /** Initial selected codes (e.g. from a previous IntakeForm). */
  initialCodes?: string[];
  /**
   * Fired with the full selected-codes array each time a marker is toggled.
   * Optional so server components rendering this read-only (staff intake
   * viewer, intake history) don't have to pass a no-op handler — passing a
   * function across the server/client boundary is forbidden in App Router.
   */
  onChange?: (codes: string[]) => void;
  /** When true, markers are rendered but cannot be toggled. */
  readOnly?: boolean;
};

export function BodyDiagram({ initialCodes, onChange, readOnly }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initialCodes ?? []),
  );

  function toggle(code: string) {
    if (readOnly) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      onChange?.([...next]);
      return next;
    });
  }

  const selectedLabels = useMemo(
    () => [...selected].map(zoneLabel),
    [selected],
  );

  return (
    <div className="space-y-3">
      <svg
        viewBox="0 0 240 240"
        role="img"
        aria-label="Body diagram for marking treatment focus areas"
        className="w-full max-w-md mx-auto h-auto select-none"
      >
        {/* View labels */}
        <text x="60" y="10" textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.7">
          Front
        </text>
        <text x="180" y="10" textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.7">
          Back
        </text>
        {/* Front silhouette */}
        <BodyOutline />
        {/* Back silhouette (mirrored placement) */}
        <g transform="translate(120 0)">
          <BodyOutline />
        </g>
        {/* Front markers */}
        {FRONT_ZONES.map((z) => (
          <ZoneMarker
            key={z.code}
            zone={z}
            offsetX={0}
            active={selected.has(z.code)}
            readOnly={readOnly}
            onToggle={() => toggle(z.code)}
          />
        ))}
        {/* Back markers */}
        {BACK_ZONES.map((z) => (
          <ZoneMarker
            key={z.code}
            zone={z}
            offsetX={120}
            active={selected.has(z.code)}
            readOnly={readOnly}
            onToggle={() => toggle(z.code)}
          />
        ))}
      </svg>

      {!readOnly && (
        <p className="text-xs text-muted-foreground text-center">
          Tap any area to highlight it. Tap again to remove.
        </p>
      )}

      {selectedLabels.length > 0 ? (
        <div className="text-xs rounded-md border bg-accent/40 p-2.5">
          <span className="font-medium">Selected ({selectedLabels.length}):</span>{" "}
          <span className="text-muted-foreground">{selectedLabels.join(", ")}</span>
        </div>
      ) : (
        !readOnly && (
          <div className="text-xs text-muted-foreground text-center italic">
            No areas selected yet.
          </div>
        )
      )}
    </div>
  );
}

/**
 * Simple human silhouette built from primitive shapes. Anatomically rough
 * but recognisable; the markers do the actual work of locating zones, the
 * outline just gives them visual context.
 */
function BodyOutline() {
  return (
    <g
      stroke="currentColor"
      strokeOpacity="0.45"
      strokeWidth="1"
      strokeLinejoin="round"
      fill="rgba(148,163,184,0.10)"
      pointerEvents="none"
    >
      {/* head */}
      <ellipse cx="60" cy="24" rx="11" ry="13" />
      {/* neck */}
      <rect x="56" y="35" width="8" height="7" />
      {/* torso */}
      <path d="M 38 45 L 32 60 L 34 110 L 50 112 L 50 130 L 70 130 L 70 112 L 86 110 L 88 60 L 82 45 Z" />
      {/* left arm */}
      <path d="M 32 50 L 24 75 L 18 130 L 26 132 L 30 100 L 36 65 Z" />
      {/* right arm */}
      <path d="M 88 50 L 96 75 L 102 130 L 94 132 L 90 100 L 84 65 Z" />
      {/* left leg */}
      <path d="M 50 130 L 47 175 L 45 215 L 56 215 L 57 175 L 60 130 Z" />
      {/* right leg */}
      <path d="M 60 130 L 63 175 L 64 215 L 75 215 L 73 175 L 70 130 Z" />
      {/* left foot (front view = top of foot, back view = heel/sole — same shape, just labelled differently in the zone metadata) */}
      <ellipse cx="50" cy="222" rx="6.5" ry="4.5" />
      {/* right foot */}
      <ellipse cx="70" cy="222" rx="6.5" ry="4.5" />
    </g>
  );
}

type ZoneMarkerProps = {
  zone: Zone;
  offsetX: number;
  active: boolean;
  readOnly?: boolean;
  onToggle: () => void;
};

function ZoneMarker({ zone, offsetX, active, readOnly, onToggle }: ZoneMarkerProps) {
  const cx = zone.cx + offsetX;
  return (
    <g
      style={{ cursor: readOnly ? "default" : "pointer" }}
      onClick={onToggle}
      role={readOnly ? undefined : "button"}
      aria-pressed={readOnly ? undefined : active}
      aria-label={zone.label + (active ? " (selected)" : "")}
    >
      <title>{`${zone.label}${active ? " — selected" : ""}`}</title>
      {/* visible marker */}
      <circle
        cx={cx}
        cy={zone.cy}
        r={active ? 3.6 : 2.4}
        fill={active ? "#dc2626" : "#ffffff"}
        stroke={active ? "#dc2626" : "currentColor"}
        strokeOpacity={active ? 1 : 0.55}
        strokeWidth="1.1"
      />
      {/* Enlarged transparent hit area for finger-friendly touch targets.
          r=9 gives ~27 CSS px on a 360px-wide phone, closer to mobile-OS
          touch-target guidance. Densest zone pairs (b-trap-l ↔ b-shoulder-l,
          14 SVG units apart) will overlap by ~4 units — still resolves
          unambiguously because SVG click picks the topmost element. */}
      {!readOnly && (
        <circle cx={cx} cy={zone.cy} r="9" fill="transparent" />
      )}
    </g>
  );
}
