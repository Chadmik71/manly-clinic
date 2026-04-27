import { redirect } from "next/navigation";
import Link from "next/link";
import { addMinutes, format } from "date-fns";
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
import { ConfirmForm } from "./confirm-form";
import { createBooking } from "./actions";

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

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{
    service?: string;
    variant?: string;
    starts?: string;
  }>;
}) {
  const sp = await searchParams;
  const session = await auth();
  if (!session?.user) {
    const ret = `/book/confirm?service=${sp.service}&variant=${sp.variant}&starts=${encodeURIComponent(sp.starts ?? "")}`;
    redirect(`/login?from=${encodeURIComponent(ret)}`);
  }

  if (!sp.service || !sp.variant || !sp.starts) redirect("/book");

  const service = await db.service.findUnique({
    where: { slug: sp.service },
    include: { variants: { where: { id: sp.variant } } },
  });
  const variant = service?.variants[0];
  if (!service || !variant) redirect("/book");

  const starts = new Date(sp.starts);
  const ends = addMinutes(starts, variant.durationMin);

  const intake = await db.intakeForm.findFirst({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
  });
  const userRow = await db.user.findUnique({
    where: { id: session.user.id },
  });
  const dobIso = userRow?.dob
    ? userRow.dob.toISOString().slice(0, 10)
    : "";
  const userDefaults = {
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
            {formatDuration(variant.durationMin)} · {formatPrice(variant.priceCents)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date</span>
            <span className="font-medium">{format(starts, "EEEE d MMMM yyyy")}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Time</span>
            <span className="font-medium">
              {format(starts, "h:mm a")} – {format(ends, "h:mm a")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Booked under</span>
            <span className="font-medium">{session.user.name}</span>
          </div>
        </CardContent>
      </Card>

      <ConfirmForm
        action={createBooking}
        serviceId={service.id}
        variantId={variant.id}
        startsIso={starts.toISOString()}
        serviceHealthFundEligible={service.healthFundEligible}
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
              }
            : null
        }
      />
    </div>
  );
}
