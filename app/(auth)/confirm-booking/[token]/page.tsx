import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { CLINIC } from "@/lib/clinic";
import { verifyBookingConfirmToken } from "@/lib/booking-confirm";
import { confirmFromEmail } from "./actions";

export const metadata = { title: "Confirm your booking" };
export const dynamic = "force-dynamic";

const WHEN = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * Landing page for the "Yes, I'm coming" link in the reminder email. The GET
 * only shows the booking; confirming needs the button press, so email link
 * scanners that open every link can't confirm on the client's behalf.
 */
export default async function ConfirmBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ done?: string }>;
}) {
  const { token } = await params;
  const { done } = await searchParams;
  const id = verifyBookingConfirmToken(token);
  const b = id
    ? await db.booking.findUnique({
        where: { id },
        select: {
          status: true,
          startsAt: true,
          clientConfirmedAt: true,
          service: { select: { name: true } },
          variant: { select: { durationMin: true } },
          client: { select: { name: true } },
        },
      })
    : null;

  const callUs = (
    <p className="text-sm text-muted-foreground">
      Need to change or cancel? Call us on{" "}
      <a className="underline" href={`tel:${CLINIC.phone.replace(/\s/g, "")}`}>
        {CLINIC.phone}
      </a>
      .
    </p>
  );

  if (!b) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Link not recognised</CardTitle>
          <CardDescription>This confirmation link isn&apos;t valid.</CardDescription>
        </CardHeader>
        <CardContent>{callUs}</CardContent>
      </Card>
    );
  }

  const active = b.status === "PENDING" || b.status === "CONFIRMED";
  const upcoming = b.startsAt.getTime() > Date.now();
  const firstName = b.client.name.trim().split(/\s+/)[0];
  const when = WHEN.format(b.startsAt);
  const what = `${b.service.name}, ${b.variant.durationMin} min`;

  if (!active || !upcoming) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>This booking can&apos;t be confirmed</CardTitle>
          <CardDescription>
            {!active ? "It has been cancelled or already finished." : "Its time has already passed."}
          </CardDescription>
        </CardHeader>
        <CardContent>{callUs}</CardContent>
      </Card>
    );
  }

  if (b.clientConfirmedAt || done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>✓ You&apos;re confirmed</CardTitle>
          <CardDescription>
            Thanks {firstName}, see you {when}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm">{what}</p>
          <p className="text-sm text-muted-foreground">
            {CLINIC.address.line1}, {CLINIC.address.suburb}
          </p>
          {callUs}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirm your booking</CardTitle>
        <CardDescription>
          Hi {firstName}, are you still coming?
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border p-3 text-sm">
          <div className="font-medium">{when}</div>
          <div className="text-muted-foreground">{what}</div>
        </div>
        <form action={confirmFromEmail.bind(null, token)}>
          <Button type="submit" className="w-full">
            Yes, I&apos;m coming
          </Button>
        </form>
        {callUs}
      </CardContent>
    </Card>
  );
}
