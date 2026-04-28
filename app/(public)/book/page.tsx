import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPrice, formatDuration, categoryLabel } from "@/lib/utils";
import { ServiceVariantPicker } from "./variant-picker";
import { SlotPicker } from "./slot-picker";
import { getDistinctSlotTimes } from "@/lib/booking";
import { addDays, format, parseISO, isValid } from "date-fns";
import { sydneyTodayISO } from "@/lib/time";

export const metadata = { title: "Book an appointment" };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Resolve the date param: validate, default to Sydney today, and clamp past->today. */
function resolveDateISO(raw: string | undefined): string {
  const today = sydneyTodayISO();
  if (!raw || !ISO_DATE_RE.test(raw)) return today;
  if (!isValid(parseISO(raw))) return today;
  return raw < today ? today : raw;
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{
    service?: string;
    variant?: string;
    date?: string;
    therapist?: string;
  }>;
}) {
  const sp = await searchParams;

  // Step 1: pick a service
  if (!sp.service) {
    const services = await db.service.findMany({
      where: { active: true },
      include: { variants: { orderBy: { durationMin: "asc" } } },
      orderBy: [{ category: "asc" }, { name: "asc" }],
    });
    return (
      <div className="container py-12 max-w-5xl">
        <BookingSteps step={1} />
        <h1 className="text-3xl font-bold mt-6 mb-2">Choose a treatment</h1>
        <p className="text-muted-foreground mb-8">
          Select the modality you&apos;d like to book.
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <Card key={s.id} className="flex flex-col">
              <CardHeader>
                <Badge variant="secondary" className="w-fit mb-1">
                  {categoryLabel(s.category)}
                </Badge>
                <CardTitle>{s.name}</CardTitle>
                <CardDescription className="line-clamp-3">
                  {s.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="mt-auto">
                <Button asChild className="w-full">
                  <Link href={`/book?service=${s.slug}`}>
                    From{" "}
                    {s.variants[0] ? formatPrice(s.variants[0].priceCents) : ""}{" "}
                    →
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Step 2: pick variant + date + slot
  const service = await db.service.findUnique({
    where: { slug: sp.service },
    include: { variants: { orderBy: { durationMin: "asc" } } },
  });
  if (!service) redirect("/book");

  const variant =
    service.variants.find((v) => v.id === sp.variant) ?? service.variants[0];

  // Validate / default the date in Sydney terms. Past dates are clamped to
  // today; malformed input falls back to today (instead of crashing).
  const todayISO = sydneyTodayISO();
  const dateISO = resolveDateISO(sp.date);
  const date = parseISO(dateISO); // any instant on this Sydney calendar day

  let slots: Date[] = [];
  if (variant) {
    slots = await getDistinctSlotTimes({
      date,
      durationMin: variant.durationMin,
      therapistId: sp.therapist,
    });
  }

  // Build the 14-day picker starting from Sydney today (no past dates).
  const todayDate = parseISO(todayISO);
  const days = Array.from({ length: 14 }).map((_, i) => addDays(todayDate, i));

  return (
    <div className="container py-12 max-w-5xl">
      <BookingSteps step={2} />
      <div className="mt-6 mb-8">
        <Link
          href="/book"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Change treatment
        </Link>
        <h1 className="text-3xl font-bold mt-2">{service.name}</h1>
        <p className="text-muted-foreground">{service.description}</p>
      </div>
      <div className="grid gap-8 md:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Duration</CardTitle>
            <CardDescription>Select session length</CardDescription>
          </CardHeader>
          <CardContent>
            <ServiceVariantPicker
              serviceSlug={service.slug}
              variants={service.variants.map((v) => ({
                id: v.id,
                durationMin: v.durationMin,
                priceCents: v.priceCents,
              }))}
              selectedId={variant?.id ?? null}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Pick a date &amp; time</CardTitle>
            <CardDescription>
              All times shown in Sydney (AEST/AEDT). Sessions must finish by
              8:00 pm.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
              {days.map((d) => {
                const iso = format(d, "yyyy-MM-dd");
                const selected = dateISO === iso;
                return (
                  <Link
                    key={iso}
                    href={`/book?service=${service.slug}&variant=${
                      variant?.id ?? ""
                    }&date=${iso}`}
                    className={`shrink-0 rounded-md border px-3 py-2 text-center text-sm transition-colors ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-accent"
                    }`}
                  >
                    <div className="text-xs opacity-80">
                      {format(d, "EEE")}
                    </div>
                    <div className="font-semibold">{format(d, "d MMM")}</div>
                  </Link>
                );
              })}
            </div>
            {variant ? (
              <SlotPicker
                slots={slots.map((s) => s.toISOString())}
                serviceSlug={service.slug}
                variantId={variant.id}
                date={dateISO}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Pick a duration to see times.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function BookingSteps({ step }: { step: 1 | 2 | 3 }) {
  const steps = ["Treatment", "Date & time", "Confirm"];
  return (
    <ol className="flex items-center text-sm text-muted-foreground gap-2 flex-wrap">
      {steps.map((label, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`grid h-6 w-6 place-items-center rounded-full text-xs font-medium ${
                active
                  ? "bg-primary text-primary-foreground"
                  : done
                    ? "bg-primary/20 text-primary"
                    : "bg-muted"
              }`}
            >
              {n}
            </span>
            <span className={active ? "text-foreground font-medium" : ""}>
              {label}
            </span>
            {n < steps.length && <span className="opacity-40">/</span>}
          </li>
        );
      })}
    </ol>
  );
}
