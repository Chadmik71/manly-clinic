import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookingsNeedingHealthForm } from "@/lib/booking-intake";
import { PortalShell } from "@/components/portal-shell";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatPrice, therapistPublicName } from "@/lib/utils";

// Renders Sydney calendar time, regardless of server runtime TZ (Vercel = UTC).
const SYD_DATE_TIME = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export const metadata = { title: "Booking confirmed" };

export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const session = (await auth())!;
  const sp = await searchParams;
  const booking = sp.ref
    ? await db.booking.findFirst({
        where: { reference: sp.ref, clientId: session.user.id },
        include: { service: true, variant: true, therapist: { include: { user: true } } },
      })
    : null;
  const needsForm = booking ? (await bookingsNeedingHealthForm([booking])).has(booking.id) : false;

  return (
    <PortalShell title="Booking confirmed" user={session.user} section="client">
      <Card>
        <CardContent className="py-10 text-center">
          <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">You&apos;re all set.</h2>
          {booking ? (
            <div className="text-sm text-muted-foreground space-y-1">
              <div>
                Reference{" "}
                <span className="font-mono text-foreground">{booking.reference}</span>
              </div>
              <div className="font-semibold text-foreground text-base mt-2">
                {booking.service.name} · {booking.variant.durationMin} min
              </div>
              <div>
                {SYD_DATE_TIME.format(booking.startsAt)}
                {booking.slotLabel
                  ? ` · ${booking.slotLabel}`
                  : booking.therapist
                    ? ` · with ${therapistPublicName(booking.therapist)}`
                    : ""}
              </div>
              <div>{formatPrice(booking.priceCentsAtBooking)}</div>
              {booking.voucherAppliedCents > 0 && (
                <div className="text-emerald-600">
                  Voucher applied: −{formatPrice(booking.voucherAppliedCents)}
                </div>
              )}
            </div>
          ) : null}
          {needsForm && booking && (
            <div className="mt-6 mx-auto max-w-md rounded-md border border-primary/40 bg-primary/5 p-4 text-sm text-left">
              <p className="font-semibold">One more thing: your health form</p>
              <p className="text-muted-foreground mt-1">
                Fill it in now (about 3 minutes) so there&apos;s no paperwork when you arrive.
                We&apos;ve also emailed you the link.
              </p>
              <Button asChild className="mt-3">
                <Link href={`/portal/bookings/${booking.id}/health-form`}>Fill in my health form</Link>
              </Button>
            </div>
          )}
          <div className="flex gap-3 justify-center mt-6 flex-wrap">
            <Button asChild>
              <Link href="/portal/bookings">View my bookings</Link>
            </Button>
            {booking && process.env.STRIPE_SECRET_KEY && (
              <Button asChild variant="outline">
                <Link href={`/portal/bookings/${booking.id}/deposit`}>
                  Pay deposit online
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link href="/">Back to home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </PortalShell>
  );
}
