import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShieldCheck,
  CalendarCheck,
  HeartPulse,
  Stethoscope,
  Clock,
  MapPin,
  Phone,
} from "lucide-react";
import type { Metadata } from "next";
import { CLINIC } from "@/lib/clinic";
import { getSiteContent, type ClinicContact, type FaqItem } from "@/lib/site-content";
import { getSiteImages } from "@/lib/site-images";
import { db } from "@/lib/db";
import { formatPrice, formatDuration, categoryLabel } from "@/lib/utils";
import { GoogleReviews } from "@/components/google-reviews";
import { getGoogleReviews, type GoogleReviewsData } from "@/lib/google-reviews";
import { Blob, LeafSprig, WaveDivider } from "@/components/decor";
import { getNextAvailableSlot } from "@/lib/booking";
import {
  sydneyDateOf,
  sydneyTodayISO,
  sydneyDateMedium,
  sydneyTimeShort,
} from "@/lib/time";
import { addDays } from "date-fns";

// What a new client should expect, start to finish. Static content; icons
// reuse the lucide imports already pulled in above so no new import surface.
const FIRST_VISIT_STEPS = [
  {
    icon: CalendarCheck,
    title: "Book & complete intake online",
    body: "Choose your treatment and time, then fill in a short, secure health form so your therapist is ready before you arrive.",
  },
  {
    icon: Clock,
    title: "Arrive a few minutes early",
    body: "Come about 5 minutes before your appointment. We’ll say hello, confirm what you’d like to focus on, and answer any questions.",
  },
  {
    icon: HeartPulse,
    title: "Your treatment",
    body: "Underwear stays on and you’re draped with towels throughout (or stay fully clothed for Thai). Your therapist checks the pressure is right as they go.",
  },
  {
    icon: ShieldCheck,
    title: "Aftercare & rebates",
    body: "We’ll share simple post-care advice and process your private health-fund rebate on the spot via HiCAPS where eligible.",
  },
] as const;


function FaqJsonLd({ faqs }: { faqs: FaqItem[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

function LocalBusinessJsonLd({
  reviews,
  clinic,
}: {
  reviews: GoogleReviewsData | null;
  clinic: ClinicContact;
}) {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "MedicalBusiness",
    name: CLINIC.name,
    image: `${CLINIC.domain}/og.png`,
    url: CLINIC.domain,
    telephone: clinic.phoneE164,
    email: clinic.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: clinic.address.line1,
      addressLocality: clinic.address.suburb,
      addressRegion: clinic.address.state,
      postalCode: clinic.address.postcode,
      addressCountry: "AU",
    },
    geo: { "@type": "GeoCoordinates", latitude: -33.7962, longitude: 151.2853 },
    hasMap: `https://www.google.com/maps/place/?q=place_id:${CLINIC.googlePlaceId}`,
    areaServed: ["Manly", "Northern Beaches", "Sydney"],
    openingHours: "Mo-Su 09:00-20:00",
    priceRange: "$$",
  };

  // Only advertise an aggregate rating when we actually have real Google
  // reviews to back it (and they're displayed on-page via <GoogleReviews/>).
  // Fabricating or showing a rating with no on-site reviews violates
  // Google's structured-data guidelines.
  if (reviews && reviews.totalRatings > 0 && reviews.rating > 0) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: reviews.rating,
      reviewCount: reviews.totalRatings,
      bestRating: 5,
      worstRating: 1,
    };
  }
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const content = await getSiteContent();
  return { description: content.heroHeadline };
}

export default async function HomePage() {
  const [content, images] = await Promise.all([getSiteContent(), getSiteImages()]);
  const { clinic } = content;
  // Show all active services in the Treatments grid; previously capped at 6
  // which hid 8 of the 14 catalog entries (incl. Remedial, Hot Stone, etc.).
  // Quick-booking strip below still shows the first 4 via .slice(0, 4).
  const services = await db.service.findMany({
    where: { active: true },
    include: {
      variants: { where: { active: true }, orderBy: { durationMin: "asc" } },
    },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });

  // Reused for both the JSON-LD aggregateRating and the <GoogleReviews/>
  // section below. getGoogleReviews caches for 6h, so this and the call
  // inside <GoogleReviews/> hit the same cached fetch — no double API cost.
  const reviews = await getGoogleReviews();

  // Live "next available appointment" for the hero — reassures a visitor that
  // they can be seen soon without clicking through. Phrase as Today / Tomorrow
  // / weekday + date in Sydney time.
  const nextSlot = await getNextAvailableSlot();
  let nextAvailableLabel: string | null = null;
  if (nextSlot) {
    const slotISO = sydneyDateOf(nextSlot);
    const todayISO = sydneyTodayISO();
    const tomorrowISO = sydneyDateOf(addDays(new Date(), 1));
    const dayWord =
      slotISO === todayISO
        ? "Today"
        : slotISO === tomorrowISO
          ? "Tomorrow"
          : sydneyDateMedium(nextSlot);
    nextAvailableLabel = `${dayWord} at ${sydneyTimeShort(nextSlot)}`;
  }

  return (
    <>
      <LocalBusinessJsonLd reviews={reviews} clinic={clinic} />
      <FaqJsonLd faqs={content.faqs} />
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        {/* Themed gradient stays underneath as a graceful fallback if the
            photo is slow to load or blocked. */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/30 dark:from-primary/10 dark:via-background dark:to-accent/10" />
        {/* Calming treatment photo (Unsplash — free commercial license, no
            attribution required). Decorative, so empty alt would be valid, but
            a short descriptive alt helps SEO/screen readers. */}
        <Image
          src={images.homeHero.src}
          alt={images.homeHero.alt}
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        {/* Readability scrim: a stronger wash on mobile (text overlays the whole
            photo) that lightens on desktop, plus a left-weighted gradient so the
            headline stays crisp while the photo shows through on the right. */}
        <div className="absolute inset-0 bg-background/80 md:bg-background/45" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
        <div className="container relative py-20 md:py-28 grid gap-12 md:grid-cols-2 items-center">
          <div className="space-y-6">
            <Badge variant="outline" className="gap-1.5">
              <ShieldCheck className="h-3 w-3" />
              Privacy Act 1988 compliant clinic
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-balance">
              {content.heroHeadline}
            </h1>
            <p className="text-lg text-muted-foreground max-w-prose whitespace-pre-line">
              {content.heroIntro}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild size="lg">
                <Link href="/book">Book an appointment</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/services">View all services</Link>
              </Button>
            </div>
            {nextAvailableLabel && (
              <p className="flex items-center gap-2 text-sm font-medium text-primary">
                <span className="relative flex h-2.5 w-2.5" aria-hidden>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                </span>
                Next available appointment: {nextAvailableLabel}
              </p>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {clinic.hours}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {clinic.address.suburb} {clinic.address.state}
              </span>
              <span className="flex items-center gap-1.5">
                <Phone className="h-4 w-4" />
                {clinic.phone}
              </span>
            </div>
          </div>
          <div className="relative">
            <Card className="border-2">
              <CardHeader>
                <div className="flex items-center gap-2 text-primary">
                  <CalendarCheck className="h-5 w-5" />
                  <CardTitle>Quick booking</CardTitle>
                </div>
                <CardDescription>
                  Pick a treatment and we&apos;ll show you the next available
                  times.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {services.slice(0, 4).map((s) => (
                  <Link
                    key={s.id}
                    href={`/book?service=${s.slug}`}
                    className="flex items-center justify-between rounded-md border p-3 hover:bg-accent transition-colors"
                  >
                    <div>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">
                        from{" "}
                        {s.variants[0]
                          ? `${formatDuration(s.variants[0].durationMin)} · ${formatPrice(s.variants[0].priceCents)}`
                          : ""}
                      </div>
                    </div>
                    <span className="text-primary text-sm">Book →</span>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="relative bg-muted/30">
        <div className="container py-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
          <div className="flex items-start gap-3">
            <Stethoscope className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <div className="font-medium">Experienced therapists</div>
              <p className="text-muted-foreground">
                Friendly, experienced therapists trained in remedial, Thai, and relaxation massage.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <HeartPulse className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <div className="font-medium">Health information protected</div>
              <p className="text-muted-foreground">
                Records encrypted and stored in Australia per APP guidelines.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <div className="font-medium">NDIS &amp; Aged Care friendly</div>
              <p className="text-muted-foreground">
                Available with prior notification. Health-fund rebates may apply.
              </p>
            </div>
          </div>
        </div>
        {/* HICAPS acceptance badge — on-the-spot health-fund claims. White tile
            keeps the navy/gold logo legible on both the cream and dark themes. */}
        <div className="container flex flex-col items-center gap-3 pb-10 text-center">
          <div className="rounded-xl bg-white p-4 shadow-sm ring-1 ring-black/5">
            <Image
              src="/hicaps.png"
              alt="HICAPS"
              width={1240}
              height={209}
              className="h-auto w-[190px] sm:w-[220px]"
            />
          </div>
          <p className="max-w-md text-sm text-muted-foreground">
            We&apos;re HICAPS-enabled — claim your private health-fund rebate on
            the spot for eligible treatments. Just bring your fund card.
          </p>
        </div>
        {/* Wave flows the muted strip down into the Treatments section */}
        <WaveDivider className="pointer-events-none absolute -bottom-px left-0 h-8 w-full text-background" />
      </section>

      {/* All services */}
      <section className="container py-16 md:py-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <div className="flex items-center gap-2">
              <LeafSprig className="h-6 w-6 text-primary/70" />
              <h2 className="text-3xl font-bold tracking-tight">Treatments</h2>
            </div>
            <p className="text-muted-foreground mt-1">
              {content.treatmentsIntro}
            </p>
          </div>
          <Button asChild variant="outline" className="hidden sm:inline-flex">
            <Link href="/services">Pricing &amp; durations</Link>
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => {
            const min = s.variants[0];
            return (
              <Card key={s.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary">{categoryLabel(s.category)}</Badge>
                  </div>
                  <CardTitle>{s.name}</CardTitle>
                  <CardDescription className="line-clamp-2">
                    {s.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {min
                      ? `from ${formatPrice(min.priceCents)} · ${formatDuration(min.durationMin)}`
                      : null}
                  </span>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/book?service=${s.slug}`}>Book →</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* First-visit walkthrough — lowers booking anxiety for new clients by
          spelling out the ritual (intake, draping, aftercare) before they
          have to ask. */}
      <section className="relative border-y bg-muted/30">
        <div className="container py-16 md:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            {/* Assessment-led treatment photo (Pexels — free commercial
                license, no attribution required). Reinforces the "clinical,
                not just a spa" message beside the steps. */}
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border shadow-sm">
              <Image
                src={images.homeFirstVisit.src}
                alt={images.homeFirstVisit.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
            <div>
              <h2 className="text-3xl font-bold tracking-tight">
                Your first visit, step by step
              </h2>
              <p className="mt-2 text-muted-foreground">
                {content.firstVisitIntro}
              </p>
              <div className="mt-8 grid gap-6 sm:grid-cols-2">
                {FIRST_VISIT_STEPS.map((step, i) => {
                  const StepIcon = step.icon;
                  return (
                    <div key={i} className="rounded-xl border bg-card p-5">
                      <div className="mb-3 flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                          {i + 1}
                        </span>
                        <StepIcon className="h-5 w-5 text-primary" aria-hidden />
                      </div>
                      <h3 className="mb-1 font-medium">{step.title}</h3>
                      <p className="text-sm text-muted-foreground">{step.body}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Google reviews — server-fetched, cached 6h. Renders nothing when
          GOOGLE_PLACES_API_KEY is unset, so the page degrades gracefully. */}
      <GoogleReviews />

      {/* FAQ */}
      <section className="container py-16 md:py-20 max-w-3xl">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold tracking-tight">
            Frequently asked questions
          </h2>
          <p className="text-muted-foreground mt-2">
            Quick answers to the questions we get most often.
          </p>
        </div>
        <div className="space-y-3">
          {content.faqs.map((item, i) => (
            <details
              key={i}
              className="group rounded-lg border bg-card p-4 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 font-medium">
                <span className="whitespace-pre-line">{item.q}</span>
                <span
                  aria-hidden
                  className="text-muted-foreground transition-transform group-open:rotate-180"
                >
                  ▾
                </span>
              </summary>
              <p className="mt-3 text-sm text-muted-foreground whitespace-pre-line">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container pb-20">
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-8 md:p-12 grid md:grid-cols-2 gap-6 items-center">
          <Blob className="pointer-events-none absolute -top-20 -right-16 h-72 w-72 text-primary-foreground/10" />
          <Blob className="pointer-events-none absolute -bottom-24 -left-20 h-64 w-64 text-primary-foreground/10" />
          <div className="relative">
            <h2 className="text-2xl md:text-3xl font-bold mb-2">
              {content.ctaHeading}
            </h2>
            <p className="opacity-90 whitespace-pre-line">
              {content.ctaBody}
            </p>
          </div>
          <div className="relative flex sm:justify-end">
            <Button asChild size="lg" variant="secondary">
              <Link href="/book">Book appointment</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
