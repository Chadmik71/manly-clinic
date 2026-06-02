/**
 * Decorative vector accents — purely cosmetic SVGs used to warm up the
 * otherwise clinical marketing pages. All shapes draw with `currentColor`
 * (or theme tokens via Tailwind text-* classes), so they inherit light/dark
 * mode automatically and add no image assets or dependencies.
 *
 * Every shape is aria-hidden and pointer-events-none: they must never
 * intercept clicks on the booking CTAs they sit behind.
 */

type DecorProps = {
  className?: string;
};

/**
 * Soft organic "blob" — layered behind hero/CTA gradients to break up the
 * rectangular card grid with a calm, spa-like curve.
 */
export function Blob({ className }: DecorProps) {
  return (
    <svg
      viewBox="0 0 600 600"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M421 92c52 35 96 86 110 146 14 60-2 130-41 184-39 53-101 91-167 102-66 11-136-5-186-46-50-40-80-105-79-168 1-64 33-127 84-167 51-39 121-55 184-49 36 4 71 13 95 -2z"
        transform="translate(-20 -10)"
      />
    </svg>
  );
}

/**
 * Botanical leaf sprig — a small accent for headings and badges. Stroke-only
 * so it reads as a delicate line drawing rather than a heavy icon.
 */
export function LeafSprig({ className }: DecorProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M24 44V14" />
      <path d="M24 30c0-7 5-12 12-13 1 7-4 13-12 13z" />
      <path d="M24 22c0-7-5-12-12-13-1 7 4 13 12 13z" />
      <path d="M24 14c0-5 3-9 8-10 1 5-3 10-8 10z" />
    </svg>
  );
}

/**
 * Wave divider — sits at the bottom of a coloured section and flows into the
 * next one. Set the wrapping element's text color to the *target* section's
 * background so the wave appears to belong to the section below it.
 */
export function WaveDivider({ className }: DecorProps) {
  return (
    <svg
      viewBox="0 0 1440 80"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M0 40c180-50 360-50 540-20s360 70 540 40 240-50 360-50v70H0z"
      />
    </svg>
  );
}

/**
 * Scattered dot field — faint texture for large empty areas (hero corner).
 */
export function DotField({ className }: DecorProps) {
  const cols = 8;
  const rows = 6;
  const gap = 18;
  return (
    <svg
      viewBox={`0 0 ${cols * gap} ${rows * gap}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((_, c) => (
          <circle
            key={`${r}-${c}`}
            cx={c * gap + gap / 2}
            cy={r * gap + gap / 2}
            r="1.6"
            fill="currentColor"
          />
        )),
      )}
    </svg>
  );
}
