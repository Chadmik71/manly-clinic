import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import { format } from "date-fns";
import { CancelBookingButton } from "./cancel-button";
import { cancelBooking } from "./actions";

export const metadata = { title: "My bookings" };

export default async function MyBookings() {
  const session = (await auth())!;
  const bookings = await db.booking.findMany({
    where: { clientId: session.user.id },
    include: {
      service: true,
      variant: true,
      therapist: { include: { user: true } },
    },
    orderBy: { startsAt: "desc" },
  });

  const upcoming = bookings.filter(
    (b) => b.startsAt >= new Date() && b.status !== "CANCELLED",
  );
  const past = bookings.filter(
    (b) => b.startsAt < new Date() || b.status === "CANCELLED",
  );

  return (
    <PortalShell title="My bookings" user={session.user} section="client">
      <div className="flex justify-end mb-4">
        <Button asChild>
          <Link href="/book">+ New booking</Link>
        </Button>
      </div>

      <h2 className="font-semibold mb-2">Upcoming</h2>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-6">No upcoming bookings.</p>
      ) : (
        <div className="space-y-3 mb-8">
          {upcoming.map((b) => (
            <Card key={b.id}>
              <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={b.status === "CONFIRMED" ? "success" : "secondary"}
                    >
                      {b.status}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {b.reference}
                    </span>
                  </div>
                  <div className="font-semibold mt-1">{b.service.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {format(b.startsAt, "EEE d MMM yyyy, h:mm a")} ·{" "}
                    {b.variant.durationMin} min
                    {b.therapist?.user.name ? ` · with ${b.therapist.user.name}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">
                    {formatPrice(b.priceCentsAtBooking)}
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/portal/bookings/${b.id}/reschedule`}>
                      Reschedule
                    </Link>
                  </Button>
                  <CancelBookingButton
                    id={b.id}
                    startsAt={b.startsAt}
                    priceCents={b.priceCentsAtBooking}
                    action={cancelBooking}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <h2 className="font-semibold mb-2">Past &amp; cancelled</h2>
      {past.length === 0 ? (
        <p className="text-sm text-muted-foreground">No past bookings yet.</p>
      ) : (
        <div className="space-y-3">
          {past.map((b) => (
            <Card key={b.id} className="opacity-80">
              <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        b.status === "CANCELLED"
                          ? "destructive"
                          : b.status === "NO_SHOW"
                            ? "warning"
                            : "secondary"
                      }
                    >
                      {b.status}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {b.reference}
                    </span>
                    {b.cancellationFeeCents > 0 && (
                      <Badge variant="warning">
                        Late-cancel fee {formatPrice(b.cancellationFeeCents)}
                      </Badge>
                    )}
                  </div>
                  <div className="font-semibold mt-1">{b.service.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {format(b.startsAt, "EEE d MMM yyyy, h:mm a")} ·{" "}
                    {b.variant.durationMin} min
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {formatPrice(b.priceCentsAtBooking)}
                  </span>
                  <Button asChild size="sm" variant="ghost">
                    <a
                      href={`/api/bookings/${b.id}/invoice`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Receipt
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PortalShell>
  );
}
