import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PortalShell } from "@/components/portal-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { stripeEnabled, depositCents } from "@/lib/stripe";
import { formatPrice } from "@/lib/utils";
import { DepositForm } from "./deposit-form";

export const metadata = { title: "Pay deposit" };

export default async function DepositPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const { id } = await params;
  const b = await db.booking.findUnique({
    where: { id },
    include: { service: true, variant: true },
  });
  if (!b || b.clientId !== session.user.id) notFound();

  return (
    <PortalShell title="Pay deposit" user={session.user} section="client">
      <Link
        href="/portal/bookings"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← My bookings
      </Link>
      <Card className="mt-3">
        <CardHeader>
          <CardTitle>{b.service.name}</CardTitle>
          <CardDescription>
            Reference {b.reference} · {b.variant.durationMin} min ·{" "}
            {formatPrice(b.priceCentsAtBooking)} total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!stripeEnabled() ? (
            <div className="rounded-md border bg-muted/40 p-4 text-sm">
              <p>
                Online payments are not enabled on this site. Please pay in
                clinic on the day of your appointment.
              </p>
              <div className="mt-3">
                <Button asChild>
                  <Link href="/portal/bookings">Back to my bookings</Link>
                </Button>
              </div>
            </div>
          ) : b.paidCents >= b.priceCentsAtBooking ? (
            <p className="text-sm">
              This booking is paid in full. Thanks!
            </p>
          ) : (
            <DepositForm
              bookingId={b.id}
              expectedAmount={depositCents(b.priceCentsAtBooking)}
            />
          )}
        </CardContent>
      </Card>
    </PortalShell>
  );
}
