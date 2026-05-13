import { redirect } from "next/navigation";
import Link from "next/link";
import { addMinutes } from "date-fns";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatPrice, formatDuration } from "@/lib/utils";
import { applyHolidaySurcharge } from "@/lib/holidays";
import { ConfirmForm } from "./confirm-form";
import { NotYouLink } from "./not-you-link";
import { createBooking } from "./actions";

// Sydney-aware formatters (Vercel runtime is UTC, clinic is Australia/Sydney).
const SYD_DATE = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const SYD_TIME = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function parseHistoryJson(s: string | null): string[] {
  if (!s) return [];
  try {
    const arr = JSON.parse(s);
    return Array.isArray(arr)
      ? arr.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

export const metadata = { title: "Confirm booking" };

const EMPTY_USER_DEFAULTS = {
  dob: "",
  gender: "",
  addressLine1: "",
  suburb: "",
  stateRegion: "",
  postcode: "",
  gpName: "",
  gpClinic: "",
  gpPhone: "",
};

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{
    service?: string;
    variant?: string;
    starts?: string;
    partner?: string;
  }>;
}) {
  const sp = await searchParams;
  if (!sp.service || !sp.variant || !sp.starts) redirect("/book");

  const service = await db.service.findUnique({
    where: { slug: sp.service },
    include: { variants: { where: { id: sp.variant } } },
  });
  const variant = service?.variants[0];

  // Couple-booking partner half. We resolve the partner variant from the
  // ?partner=<variantId> URL param. Each partner picks their own duration —
  // the slot-finding logic upstream already ensures both halves can be
  // accommodated at the chosen time. This page formats a human-readable
  // summary for the customer.
  const partnerVariant = sp.partner
    ? await db.serviceVariant.findUnique({
        where: { id: sp.partner },
        include: { service: { select: { name: true } } },
      })
    : null;
  const validPartnerVariantId = partnerVariant && variant ? sp.partner : null;
  if (!service || !variant) redirect("/book");

  const starts = new Date(sp.starts);
  if (isNaN(starts.getTime())) redirect("/book");
  const ends = addMinutes(starts, variant.durationMin);

  // Compute the public-holiday surcharge breakdown so the customer sees the
  // final price (and any surcharge) on the confirm page, not after submission.
  const pricing = applyHolidaySurcharge(variant.priceCents, starts);
  // Apply the same public-holiday surcharge to the partner half (couple booking)
  // so both halves are quoted consistently — same percentage on the same date.
  const partnerPricing = partnerVariant
    ? applyHolidaySurcharge(partnerVariant.priceCents, starts)
    : null;
  const partnerVariantSummary =
    partnerVariant && variant && partnerPricing
      ? `${partnerVariant.service.name} — ${partnerVariant.durationMin} min ($${(partnerPricing.finalPriceCents / 100).toFixed(2)})`
      : null;

  // Optional session — we now allow guest checkout.
  const session = await auth();

  // Pull intake + user defaults only when the visitor is signed in. For
  // guests we render empty defaults and the form prompts for their basics
  // up front.
  let userDefaults = EMPTY_USER_DEFAULTS;
  let intake: Awaited<ReturnType<typeof db.intakeForm.findFirst>> = null;
  let bookedUnderName: string | null = null;
  let signedInEmail: string | null = null;

  if (session?.user) {
    const userRow = await db.user.findUnique({
      where: { id: session.user.id },
    });
    intake = await db.intakeForm.findFirst({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
    });
    const dobIso = userRow?.dob ? userRow.dob.toISOString().slice(0, 10) : "";
    userDefaults = {
      dob: dobIso,
      gender: userRow?.gender ?? "",
      addressLine1: userRow?.addressLine1 ?? "",
      suburb: userRow?.suburb ?? "",
      stateRegion: userRow?.stateRegion ?? "",
      postcode: userRow?.postcode ?? "",
      gpName: userRow?.gpName ?? "",
      gpClinic: userRow?.gpClinic ?? "",
      gpPhone: userRow?.gpPhone ?? "",
    };
    bookedUnderName = session.user.name ?? null;
    signedInEmail = session.user.email ?? null;
  }

  return (
    <div className="container py-12 max-w-3xl">
      <Link
        href={`/book?service=${sp.service}&variant=${sp.variant}`}
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Change time
      </Link>
      <h1 className="text-3xl font-bold mt-2 mb-6">Confirm your booking</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>{service.name}</CardTitle>
          <CardDescription>
            {formatDuration(variant.durationMin)} ·{" "}
            {formatPrice(pricing.finalPriceCents)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date</span>
            <span className="font-medium">{SYD_DATE.format(starts)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Time</span>
            <span className="font-medium">
              {SYD_TIME.format(starts)} – {SYD_TIME.format(ends)} (Sydney)
            </span>
          </div>
          {bookedUnderName ? (
            <div className="flex justify-between items-center gap-2">
              <span className="text-muted-foreground">Booked under</span>
              <span className="flex items-center gap-2">
                <span className="font-medium">{bookedUnderName}</span>
                <NotYouLink />
              </span>
            </div>
          ) : null}

          {/* Pricing breakdown — always show treatment line; show surcharge
              and total only when a public holiday applies. */}
          <div className="border-t mt-2 pt-2 flex justify-between">
            <span className="text-muted-foreground">Treatment</span>
            <span className="font-medium">
              {formatPrice(pricing.basePriceCents)}
            </span>
          </div>
          {pricing.holidayName ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Public holiday surcharge ({pricing.surchargePct}% ·{" "}
                {pricing.holidayName})
              </span>
              <span>
                +{formatPrice(pricing.surchargeCents)}
              </span>
            </div>
          ) : null}
          {partnerVariant ? (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Partner</span>
              <span className="font-medium">
                {formatPrice(partnerPricing?.finalPriceCents ?? 0)}
              </span>
            </div>
          ) : null}
          {(pricing.holidayName || partnerVariant) ? (
            <div className="border-t pt-2 flex justify-between">
              <span className="font-semibold">Total</span>
              <span className="font-semibold">
                {formatPrice(pricing.finalPriceCents + (partnerPricing?.finalPriceCents ?? 0))}
              </span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {!session?.user && (
        <div className="mb-6 rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
          Already booked with us before?{" "}
          <Link
            href={`/login?from=${encodeURIComponent(
              `/book/confirm?service=${sp.service}&variant=${sp.variant}&starts=${encodeURIComponent(sp.starts)}`,
            )}`}
            className="text-primary font-medium hover:underline"
          >
            Sign in
          </Link>{" "}
          to skip filling in details. Otherwise just continue below —
          we&apos;ll link this booking to your existing record automatically
          by email or phone.
        </div>
      )}

      <ConfirmForm
        action={createBooking}
        serviceId={service.id}
        serviceSlug={service.slug}
        variantId={variant.id}
        startsIso={starts.toISOString()}
        serviceHealthFundEligible={service.healthFundEligible}
        isGuest={!session?.user}
        partnerVariantId={validPartnerVariantId}
        partnerVariantSummary={partnerVariantSummary}
        signedInEmail={signedInEmail}
        bookingSummary={{
          serviceName: service.name,
          durationLabel: formatDuration(variant.durationMin),
          priceLabel: formatPrice(pricing.finalPriceCents),
          dateLabel: SYD_DATE.format(starts),
          timeLabel: `${SYD_TIME.format(starts)} – ${SYD_TIME.format(ends)} (Sydney)`,
          partnerLabel: partnerVariantSummary,
        }}
        userDefaults={userDefaults}
        intakeDefaults={
          intake
            ? {
                medicalConditions: intake.medicalConditions ?? "",
                medications: intake.medications ?? "",
                allergies: intake.allergies ?? "",
                injuries: intake.injuries ?? "",
                medicalHistory: parseHistoryJson(intake.medicalHistory),
                painLocation: intake.painLocation ?? "",
                painScale: intake.painScale ?? null,
                painOnset: intake.painOnset ?? "",
                painHistory: intake.painHistory ?? "",
                treatmentGoals: intake.treatmentGoals ?? "",
                pregnancy: intake.pregnancy ?? false,
                pregnancyWeeks: intake.pregnancyWeeks ?? null,
                emergencyContactName: intake.emergencyContactName ?? "",
                emergencyContactRelationship:
                  intake.emergencyContactRelationship ?? "",
                emergencyContactPhone: intake.emergencyContactPhone ?? "",
                healthFundName: intake.healthFundName ?? "",
                healthFundMemberNumber: intake.healthFundMemberNumber ?? "",
                reasonForTreatment: intake.reasonForTreatment ?? "",
              painLocationCodes: parseHistoryJson(intake.painLocationCodes),
              }
            : null
        }
      />
    </div>
  );
}
