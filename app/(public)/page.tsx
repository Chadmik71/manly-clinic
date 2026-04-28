import Link from "next/link";
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
import { CLINIC } from "@/lib/clinic";
import { db } from "@/lib/db";
import { formatPrice, formatDuration, categoryLabel } from "@/lib/utils";

function LocalBusinessJsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@type": "MedicalBusiness",
    name: CLINIC.name,
    image: `${CLINIC.domain}/og.png`,
    url: CLINIC.domain,
    telephone: CLINIC.phoneE164,
    email: CLINIC.email,
    address: {
      "@type": "PostalAddress",
      streetAddress: CLINIC.address.line1,
      addressLocality: CLINIC.address.suburb,
      addressRegion: CLINIC.address.state,
      postalCode: CLINIC.address.postcode,
      addressCountry: "AU",
    },
    openingHours: "Mo-Su 09:00-20:00",
    priceRange: "$$",
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default async function HomePage() {
  // Show all active services in the Treatments grid; previously capped at 6
  // which hid 8 of the 14 catalog entries (incl. Remedial, Hot Stone, etc.).
  // Quick-booking strip below still shows the first 4 via .slice(0, 4).
  const services = await db.service.findMany({
    where: { active: true },
    include: {
      variants: { orderBy: { durationMin: "asc" } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <LocalBusinessJsonLd />
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/30 dark:from-primary/10 dark:via-background dark:to-accent/10" />
        <div className="container relative py-20 md:py-28 grid gap-12 md:grid-cols-2 items-center">
          <div className="space-y-6">
            <Badge variant="outline" className="gap-1.5">
              <ShieldCheck className="h-3 w-3" />
              Privacy Act 1988 compliant clinic
            </Badge>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-balance">
              Evidence-based remedial therapy on Sydney&apos;s Northern Beaches
            </h1>
            <p className="text-lg text-muted-foreground max-w-prose">
              Qualified therapists. Clinical assessment. Health-fund eligible
              treatments. Book online in under a minute — your records, your
              control.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button asChild size="lg">
                <Link href="/book">Book an appointment</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/services">View all services</Link>
              </Button>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2 pt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {CLINIC.hours}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {CLINIC.address.suburb} {CLINIC.address.state}
              </span>
              <span className="flex items-center gap-1.5">
                <Phone className="h-4 w-4" />
                {CLINIC.phone}
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
      <section className="border-b bg-muted/30">
        <div className="container py-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
          <div className="flex items-start gap-3">
            <Stethoscope className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <div className="font-medium">Qualified clinicians</div>
              <p className="text-muted-foreground">
                Diploma-trained remedial therapists with 10+ years of practice.
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
      </section>

      {/* All services */}
      <section className="container py-16 md:py-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Treatments</h2>
            <p className="text-muted-foreground mt-1">
              Clinical and relaxation modalities, all delivered by qualified
              therapists.
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

      {/* CTA */}
      <section className="container pb-20">
        <div className="rounded-2xl border bg-gradient-to-br from-primary to-primary/70 text-primary-foreground p-8 md:p-12 grid md:grid-cols-2 gap-6 items-center">
          <div>
            <h2 className="text-2xl md:text-3xl font-bold mb-2">
              Ready to book?
            </h2>
            <p className="opacity-90">
              Online booking is open 24/7. Your intake form and consent are
              handled securely before your first visit.
            </p>
          </div>
          <div className="flex sm:justify-end">
            <Button asChild size="lg" variant="secondary">
              <Link href="/book">Book appointment</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
