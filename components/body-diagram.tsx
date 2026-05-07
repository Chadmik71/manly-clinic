"use client";

import { useState, useMemo } from "react";

/**
 * Body diagram with clickable zones for the intake form.
 *
 * Renders a simplified front + back human silhouette in a single SVG with
 * clickable circle markers at each anatomical region. Selected zones are
 * highlighted in red and exposed via onChange as an array of stable string
 * codes (the same codes are stored on IntakeForm.painLocationCodes so
 * returning customers see their previous selection).
 *
 * Codes are prefixed:
 *   f-* = front view
 *   b-* = back view
 * so the staff portal can render the same diagram read-only without an
 * additional join.
 */

type Zone = {
  code: string;
  label: string;
  cx: number;
  cy: number;
};

const FRONT_ZONES: Zone[] = [
  { code: "f-head",        label: "Head / face",                  cx: 60,  cy: 25  },
  { code: "f-neck",        label: "Neck (front)",                 cx: 60,  cy: 40  },
  { code: "f-shoulder-l",  label: "Left shoulder (front)",        cx: 38,  cy: 50  },
  { code: "f-shoulder-r",  label: "Right shoulder (front)",       cx: 82,  cy: 50  },
  { code: "f-chest-l",     label: "Left chest",                   cx: 50,  cy: 65  },
  { code: "f-chest-r",     label: "Right chest",                  cx: 70,  cy: 65  },
  { code: "f-arm-l",       label: "Left upper arm (front)",       cx: 26,  cy: 80  },
  { code: "f-arm-r",       label: "Right upper arm (front)",      cx: 94,  cy: 80  },
  { code: "f-abdomen",     label: "Abdomen",                      cx: 60,  cy: 92  },
  { code: "f-forearm-l",   label: "Left forearm (front)",         cx: 22,  cy: 115 },
  { code: "f-forearm-r",   label: "Right forearm (front)",        cx: 98,  cy: 115 },
  { code: "f-hip-l",       label: "Left hip",                     cx: 53,  cy: 122 },
  { code: "f-hip-r",       label: "Right hip",                    cx: 67,  cy: 122 },
  { code: "f-quad-l",      label: "Left thigh (front)",           cx: 51,  cy: 155 },
  { code: "f-quad-r",      label: "Right thigh (front)",          cx: 69,  cy: 155 },
  { code: "f-knee-l",      label: "Left knee",                    cx: 51,  cy: 178 },
  { code: "f-knee-r",      label: "Right knee",                   cx: 69,  cy: 178 },
  { code: "f-shin-l",      label: "Left shin",                    cx: 51,  cy: 200 },
  { code: "f-shin-r",      label: "Right shin",                   cx: 69,  cy: 200 },
];

const BACK_ZONES: Zone[] = [
  { code: "b-head",        label: "Back of head",                 cx: 60,  cy: 25  },
  { code: "b-neck",        label: "Neck (back)",                  cx: 60,  cy: 40  },
  { code: "b-trap-l",      label: "Left trapezius",               cx: 50,  cy: 52  },
  { code: "b-trap-r",      label: "Right trapezius",              cx: 70,  cy: 52  },
  { code: "b-shoulder-l",  label: "Left shoulder (back)",         cx: 38,  cy: 60  },
  { code: "b-shoulder-r",  label: "Right shoulder (back)",        cx: 82,  cy: 60  },
  { code: "b-arm-l",       label: "Left upper arm (back)",        cx: 26,  cy: 80  },
  { code: "b-arm-r",       label: "Right upper arm (back)",       cx: 94,  cy: 80  },
  { code: "b-upper-back",  label: "Upper back",                   cx: 60,  cy: 75  },
  { code: "b-mid-back",    label: "Mid back",                     cx: 60,  cy: 95  },
  { code: "b-forearm-l",   label: "Left forearm (back)",          cx: 22,  cy: 115 },
  { code: "b-forearm-r",   label: "Right forearm (back)",         cx: 98,  cy: 115 },
  { code: "b-lower-back",  label: "Lower back / lumbar",          cx: 60,  cy: 118 },
  { code: "b-glute-l",     label: "Left glute",                   cx: 53,  cy: 135 },
  { code: "b-glute-r",     label: "Right glute",                  cx: 67,  cy: 135 },
  { code: "b-hamstring-l", label: "Left hamstring",               cx: 51,  cy: 162 },
  { code: "b-hamstring-r", label: "Right hamstring",              cx: 69,  cy: 162 },
  { code: "b-calf-l",      label: "Left calf",                    cx: 51,  cy: 195 },
  { code: "b-calf-r",      label: "Right calf",                   cx: 69,  cy: 195 },
];

const ALL_ZONES: Zone[] = [
  ...FRONT_ZONES,
  ...BACK_ZONES.map((z) => ({ ...z, cx: z.cx + 120 })),
];

/** Public lookup so other components (e.g. staff intake viewer) can resolve a code to its label. */
export function zoneLabel(code: string): string {
  return ALL_ZONES.find((z) => z.code === code)?.label ?? code;
}

type Props = {
  /** Initial selected codes (e.g. from a previous IntakeForm). */
  initialCodes?: string[];
  /** Fired with the full selected-codes array each time a marker is toggled. */
  onChange: (codes: string[]) => void;
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
      onChange([...next]);
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
        viewBox="0 0 240 230"
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
      <title>{zone.label}{active ? " — selected" : ""}</title>
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
      {/* enlarged transparent hit area for finger-friendly touch targets */}
      {!readOnly && (
        <circle cx={cx} cy={zone.cy} r="7" fill="transparent" />
      )}
    </g>
  );
}
