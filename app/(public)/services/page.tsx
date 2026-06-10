import Link from "next/link";
import Image from "next/image";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatPrice, formatDuration, categoryLabel } from "@/lib/utils";
import { Blob, LeafSprig } from "@/components/decor";

export const metadata = {
  title: "Services & pricing",
  description:
    "Remedial, Thai, pregnancy and relaxation massage in Manly on Sydney's Northern Beaches. View treatments, durations and pricing. Health-fund rebates available for remedial sessions.",
};

export default async function ServicesPage() {
  const services = await db.service.findMany({
    where: { active: true },
    include: { variants: { orderBy: { durationMin: "asc" } } },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });

  const grouped = services.reduce<Record<string, typeof services>>((acc, s) => {
    (acc[s.category] ??= []).push(s);
    return acc;
  }, {});

  const order = ["THERAPEUTIC", "RELAXATION", "SPECIALTY", "ADD_ON"];

  return (
    <div className="relative overflow-hidden container py-12 md:py-16">
      <Blob className="pointer-events-none absolute -top-32 -right-40 h-[26rem] w-[26rem] text-accent/30 dark:text-accent/15" />
      <div className="relative mb-10 max-w-2xl">
        <div className="flex items-center gap-2 mb-3">
          <LeafSprig className="h-7 w-7 text-primary/70" />
          <h1 className="text-4xl font-bold tracking-tight">
            Services &amp; pricing
          </h1>
        </div>
        <p className="text-muted-foreground">
          All treatments delivered by qualified remedial therapists. Health
          fund rebates may apply for remedial sessions — please check with
          your fund prior to booking. A 10% surcharge applies on public
          holidays.
        </p>
        {/* HICAPS badge — on-the-spot claims. White tile keeps the navy/gold
            logo legible on both the cream and dark themes. */}
        <div className="mt-5 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="shrink-0 rounded-lg bg-white p-3 shadow-sm ring-1 ring-black/5">
            <Image
              src="/hicaps.png"
              alt="HICAPS"
              width={1240}
              height={209}
              className="h-auto w-[170px]"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            HICAPS-enabled — claim your private health-fund rebate on the spot
            for eligible treatments. Just bring your fund card.
          </p>
        </div>
      </div>

      {order.map((cat) =>
        grouped[cat] ? (
          <section key={cat} className="mb-12">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-2xl font-semibold">{categoryLabel(cat)}</h2>
              <Badge variant="secondary">{grouped[cat].length}</Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {grouped[cat].map((s) => (
                <Card key={s.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle>{s.name}</CardTitle>
                      {s.healthFundEligible && (
                        <Badge variant="success" className="shrink-0">
                          Health fund rebatable
                        </Badge>
                      )}
                    </div>
                    <CardDescription>{s.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <table className="w-full text-sm">
                      <tbody>
                        {s.variants.map((v) => (
                          <tr
                            key={v.id}
                            className="border-t first:border-t-0"
                          >
                            <td className="py-2 text-muted-foreground">
                              {formatDuration(v.durationMin)}
                            </td>
                            <td className="py-2 text-right font-medium">
                              {formatPrice(v.priceCents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Button asChild className="w-full" variant="outline">
                      <Link href={`/book?service=${s.slug}`}>Book {s.name}</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}
