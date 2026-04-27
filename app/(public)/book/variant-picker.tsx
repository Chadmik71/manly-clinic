"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { formatPrice, formatDuration } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function ServiceVariantPicker({
  serviceSlug,
  variants,
  selectedId,
}: {
  serviceSlug: string;
  variants: { id: string; durationMin: number; priceCents: number }[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function pick(id: string) {
    const params = new URLSearchParams(sp);
    params.set("service", serviceSlug);
    params.set("variant", id);
    router.push(`/book?${params.toString()}`);
  }

  const cheapest = variants.reduce(
    (min, v) => (v.priceCents < min ? v.priceCents : min),
    variants[0]?.priceCents ?? 0,
  );

  return (
    <div className="grid gap-2">
      {variants.map((v) => {
        const active = v.id === selectedId;
        const isCheapest = v.priceCents === cheapest && variants.length > 1;
        return (
          <button
            key={v.id}
            type="button"
            onClick={() => pick(v.id)}
            aria-pressed={active}
            className={cn(
              "group relative w-full text-left rounded-lg border px-4 py-3 transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
              active
                ? "border-primary bg-primary/5 ring-2 ring-primary shadow-sm"
                : "hover:border-foreground/30 hover:bg-accent/40",
            )}
          >
            <div className="flex items-baseline justify-between gap-3 min-w-0">
              <span
                className={cn(
                  "font-medium whitespace-nowrap text-base",
                  active && "text-primary",
                )}
              >
                {formatDuration(v.durationMin)}
              </span>
              <span
                className={cn(
                  "tabular-nums whitespace-nowrap font-semibold",
                  active ? "text-primary" : "text-foreground",
                )}
              >
                {formatPrice(v.priceCents)}
              </span>
            </div>
            {isCheapest && !active && (
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mt-0.5">
                from
              </div>
            )}
            {active && (
              <span
                aria-hidden
                className="absolute -top-2 -right-2 grid h-5 w-5 place-items-center rounded-full bg-primary text-primary-foreground"
              >
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
