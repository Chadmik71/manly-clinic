import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
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
import { CouplePicker } from "./couple-picker";
import { getDistinctSlotTimes } from "@/lib/booking";
import { addDays, format, parseISO, isValid } from "date-fns";
import { sydneyTodayISO } from "@/lib/time";

export const metadata = {
  title: "Book an appointment",
  description:
    "Book remedial, Thai, pregnancy or relaxation massage online at Manly Remedial Thai in Manly. Real-time availability, 7 days a week, 9am–8pm.",
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FORWARD_DAYS = 90;

/**
 * Resolve the date param into a Sydney calendar day:
 *  - missing / malformed → today
 *  - in the past → today
 *  - more than MAX_FORWARD_DAYS away → today + MAX_FORWARD_DAYS
 *  - otherwise → the value as-is
 */
function resolveDateISO(raw: string | undefined): string {
  const today = sydneyTodayISO();
  if (!raw || !ISO_DATE_RE.test(raw)) return today;
  if (!isValid(parseISO(raw))) return today;
  if (raw < today) return today;
  const maxISO = format(addDays(parseISO(today), MAX_FORWARD_DAYS), "yyyy-MM-dd");
  if (raw > maxISO) return maxISO;
  return raw;
}

export default async function BookPage({
  searchParams,
}: {
  searchParams: Promise<{
    service?: string;
    variant?: string;
    date?: string;
    therapist?: string;
    partner?: string;
  }>;
}) {
  const sp = await searchParams;

  // Step 1: pick a service
  if (!sp.service) {
    const session = await auth();
    const services = await db.service.findMany({
      where: { active: true },
      include: { variants: { orderBy: { durationMin: "asc" } } },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    });

    // Guest fast-path: if a previous booking on this device dropped the
    // mrt_last_booking cookie, surface a "Book {Service} again" banner so
    // returning customers don't have to walk the service grid. Validated
    // against the live catalog so deactivated services / removed variants
    // fall back to the generic banner.
    let lastBooking:
      | { slug: string; variantId: string; name: string; durationMin: number }
      | null = null;
    if (!session?.user) {
      const raw = (await cookies()).get("mrt_last_booking")?.value;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<{
            slug: string;
            variantId: string;
            name: string;
            durationMin: number;
          }>;
          if (
            typeof parsed.slug === "string" &&
            typeof parsed.variantId === "string" &&
            typeof parsed.name === "string" &&
            typeof parsed.durationMin === "number"
          ) {
            const svc = services.find((s) => s.slug === parsed.slug);
            const variantStillExists = svc?.variants.some(
              (v) => v.id === parsed.variantId,
            );
            if (svc && variantStillExists) {
              lastBooking = {
                slug: parsed.slug,
                variantId: parsed.variantId,
                name: parsed.name,
                durationMin: parsed.durationMin,
              };
            }
          }
        } catch {
          // Malformed cookie — ignore and fall through to generic banner.
        }
      }
    }

    return (
      <div className="container py-12 max-w-5xl">
        <BookingSteps step={1} />
        <h1 className="text-3xl font-bold mt-6 mb-2">Choose a treatment</h1>
        <p className="text-muted-foreground mb-6">
          Select the modality you&apos;d like to book.
        </p>
        {/* Slim, decorative welcome banner — step 1 only. Kept off the
            date/time picker (step 2) to leave the conversion-critical
            slot UI untouched. Pexels — free commercial license. */}
        <div className="relative mb-8 hidden h-36 w-full overflow-hidden rounded-2xl border sm:block">
          <Image
            src="/book-welcome.jpg"
            alt="Remedial therapist treating a client at the clinic"
            fill
            sizes="100vw"
            className="object-cover object-center"
          />
        </div>
        {!session?.user && lastBooking ? (
          <div className="mb-6 rounded-md border border-primary/40 bg-primary/10 p-4 text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium">Welcome back!</span>
            <Link
              href={`/book?service=${lastBooking.slug}&variant=${lastBooking.variantId}`}
              className="text-primary font-semibold hover:underline"
            >
              Book {lastBooking.name} ({formatDuration(lastBooking.durationMin)}) again →
            </Link>
            <span className="text-muted-foreground">No sign-in needed.</span>
          </div>
        ) : !session?.user ? (
          <div className="mb-6 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>Booked with us before?</span>
            <Link
              href={`/login?from=${encodeURIComponent("/portal")}`}
              className="text-primary font-medium hover:underline"
            >
              Sign in
            </Link>
            <span className="text-muted-foreground">
              to skip the form and re-book your last visit in one tap.
            </span>
          </div>
        ) : null}
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

  // Couple bookings: fetch all variants from any active service whose duration
  // matches the primary variant’s duration. Both partners must finish at the
  // We share startsAt with the partner half but each side has its own
  // durationMin and endsAt — the partner can pick a longer or shorter
  // service if they want. The slot calculation below intersects per-duration
  // therapist availability so only times that work for *both* halves show.
  const partnerVariantsRaw = variant
    ? await db.serviceVariant.findMany({
        where: { service: { active: true } },
        include: { service: { select: { name: true, category: true } } },
        orderBy: [{ durationMin: "asc" }, { priceCents: "asc" }],
      })
    : [];
  const partnerVariants = partnerVariantsRaw.map((pv) => ({
    id: pv.id,
    durationMin: pv.durationMin,
    priceCents: pv.priceCents,
    serviceName: pv.service.name,
    category: pv.service.category,
  }));
  const selectedPartner =
    sp.partner ? partnerVariants.find((pv) => pv.id === sp.partner) ?? null : null;
  const selectedPartnerId = selectedPartner?.id ?? null;

  // Validate / default the date in Sydney terms. Past dates clamp to today,
  // dates more than 90 days out clamp to today+90, malformed input falls back
  // to today (instead of crashing).
  const todayISO = sydneyTodayISO();
  const dateISO = resolveDateISO(sp.date);
  const date = parseISO(dateISO); // any instant on this Sydney calendar day

  let slots: Date[] = [];
  if (variant) {
    slots = await getDistinctSlotTimes({
      date,
      durationMin: variant.durationMin,
      therapistId: sp.therapist,
      // Couple bookings require two free therapists simultaneously.
      minTherapists: selectedPartner ? 2 : 1,
      // Partner may pick a different duration. When set, slot times are
      // intersected with partner-side availability so only times that work
      // for both halves show.
      partnerDurationMin: selectedPartner?.durationMin,
    });
  }

  // If the chosen day has no slots, walk forward one day at a time until
  // we find one that does (or run out of the 14-day strip). We do this
  // sequentially with an early exit so a fully-booked clinic doesn't
  // trigger 14 parallel DB queries every page load — typical case finds
  // a free day within 1-3 hops. We cap at 14 to match the date strip.
  let nextAvailableDate: string | null = null;
  if (variant && slots.length === 0) {
    const startDay = parseISO(dateISO);
    for (let i = 1; i <= 14; i++) {
      const candidate = addDays(startDay, i);
      const candidateIso = format(candidate, "yyyy-MM-dd");
      const candidateSlots = await getDistinctSlotTimes({
        date: candidate,
        durationMin: variant.durationMin,
        therapistId: sp.therapist,
        minTherapists: selectedPartner ? 2 : 1,
        partnerDurationMin: selectedPartner?.durationMin,
      });
      if (candidateSlots.length > 0) {
        nextAvailableDate = candidateIso;
        break;
      }
    }
  }

  // Build the 14-day picker starting from Sydney today (no past dates).
  const todayDate = parseISO(todayISO);
  const days = Array.from({ length: 14 }).map((_, i) => addDays(todayDate, i));

  return (
    <div className="container py-6 sm:py-12 max-w-5xl">
      <BookingSteps step={2} />
      <div className="mt-4 sm:mt-6 mb-4 sm:mb-8">
        <Link
          href="/book"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Change treatment
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold mt-2">{service.name}</h1>
        <p className="text-sm sm:text-base text-muted-foreground line-clamp-2 sm:line-clamp-none">{service.description}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card className="min-w-0">
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
            {variant && partnerVariants.length > 0 && (
              <div className="mt-6 pt-4 border-t">
                <CouplePicker
                  partnerVariants={partnerVariants}
                  selectedPartnerId={selectedPartnerId}
                />
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Pick a date &amp; time</CardTitle>
            <CardDescription>
              All times shown in Sydney (AEST/AEDT). Sessions must finish by
              8:00 pm. Bookings open up to 90 days ahead.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex gap-2 overflow-x-auto overflow-y-hidden pb-2 -mx-1 px-1">
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
                partnerVariantId={selectedPartnerId ?? undefined}
                nextAvailableDate={nextAvailableDate}
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
