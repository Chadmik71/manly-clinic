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
