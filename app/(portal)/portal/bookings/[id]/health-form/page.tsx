import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CompleteIntakeForm } from "@/app/(portal)/staff/bookings/[id]/complete-intake-form";
import { bookingsNeedingHealthForm, getIntakePrefill } from "@/lib/booking-intake";
import { sydneyDateLong, sydneyTimeShort } from "@/lib/time";
import { submitMyHealthForm } from "./actions";

export const metadata = { title: "Health form" };

/**
 * The client's own health form for an upcoming booking, linked from the
 * booking confirmation email when they chose "fill it in later".
 */
export default async function HealthFormPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const { id } = await params;
  if (!session?.user) redirect(`/login?from=/portal/bookings/${id}/health-form`);

  const b = await db.booking.findUnique({
    where: { id },
    include: { service: true, variant: true },
  });
  if (!b || b.clientId !== session.user.id) notFound();
  const upcoming = b.status === "PENDING" || b.status === "CONFIRMED";

  // Already done for this booking? (A full form saved since it was booked.)
  const doneAlready = !(await bookingsNeedingHealthForm([b])).has(b.id);

  const prefill = await getIntakePrefill(b.clientId);

  return (
    <PortalShell title="Health form" user={session.user} section="client">
      <Card>
        <CardHeader>
          <CardTitle>Your health form</CardTitle>
          <CardDescription>
            For your {b.variant.durationMin} min {b.service.name} on {sydneyDateLong(b.startsAt)} at{" "}
            {sydneyTimeShort(b.startsAt)}. It takes about 3 minutes and helps your therapist
            treat you safely.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!upcoming ? (
            <p className="text-sm text-muted-foreground">
              This booking is no longer upcoming, so the form can&apos;t be changed here.{" "}
              <Link href="/portal/bookings" className="text-primary hover:underline">
                Back to my bookings
              </Link>
            </p>
          ) : doneAlready ? (
            <p className="text-sm text-emerald-700 dark:text-emerald-400">
              ✓ Your health form for this booking is already done. Thank you! If something has
              changed, just let your therapist know when you arrive.
            </p>
          ) : (
            <CompleteIntakeForm
              bookingId={b.id}
              healthFundEligible={b.service.healthFundEligible}
              isPregnancyService={b.service.slug === "pregnancy-massage"}
              prefill={prefill}
              action={submitMyHealthForm}
              audience="client"
            />
          )}
        </CardContent>
      </Card>
    </PortalShell>
  );
}
