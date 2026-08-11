import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPrice(cents: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

export function formatDuration(min: number): string {
  return `${min} min`;
}

export function bookingReference(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "MNL-";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function categoryLabel(c: string): string {
  return (
    {
      RELAXATION: "Relaxation",
      THERAPEUTIC: "Therapeutic",
      SPECIALTY: "Specialty",
      ADD_ON: "Add-on",
    } as Record<string, string>
  )[c] ?? c;
}

/**
 * Therapist record shape sufficient for name resolution.
 * Accepts either { displayName, user: { name } } or { displayName, name }.
 */
export type TherapistNameish = {
  id?: string;
  displayName?: string | null;
  user?: { name: string | null } | null;
  name?: string | null;
};

function realName(t: TherapistNameish): string {
  return t.user?.name ?? t.name ?? "Unknown";
}

/**
 * Customer-facing label. Returns the slot/display name when set. Never
 * falls back to the real name — the Add Therapist form doesn't collect a
 * display name, so every newly added therapist starts in this fallback
 * state until an admin sets one from the therapist's profile page. Falls
 * back to a stable "Staff <ID>" tag instead so anonymisation holds even
 * then, and the odd-looking tag nudges staff to set a proper label.
 */
export function therapistPublicName(t: TherapistNameish): string {
  const display = t.displayName?.trim();
  if (display) return display;
  return `Staff ${t.id ? t.id.slice(-4).toUpperCase() : "????"}`;
}

/**
 * Staff-facing label. Shows the real name plus the slot label in parens
 * when both are present, e.g. "Joy (Therapist 1)". When no slot label is
 * set, returns just the real name.
 */
export function therapistInternalName(t: TherapistNameish): string {
  const real = realName(t);
  const display = t.displayName?.trim();
  if (display && display !== real) return `${real} (${display})`;
  return real;
}
