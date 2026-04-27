import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PortalShell } from "@/components/portal-shell";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import { format } from "date-fns";

export const metadata = { title: "My portal" };

export default async function PortalHome() {
  const session = (await auth())!;
  const upcoming = await db.booking.findMany({
    where: {
      clientId: session.user.id,
      startsAt: { gte: new Date() },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    include: { service: true, variant: true, therapist: { include: { user: true } } },
    orderBy: { startsAt: "asc" },
    take: 5,
  });

  return (
    <PortalShell
      title={`Welcome back, ${session.user.name.split(" ")[0]}`}
      user={session.user}
      section="client"
    >
      <div className="grid gap-4 md:grid-cols-2 mb-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/book"><Plus className="h-4 w-4" /> New booking</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/portal/intake">Update intake form</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Privacy</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Your records are encrypted and audit-logged. Visit{" "}
            <Link href="/portal/data" className="text-primary hover:underline">
              Data &amp; privacy
            </Link>{" "}
            to request access or deletion.
          </CardContent>
        </Card>
      </div>

      <h2 className="text-lg font-semibold mb-3">Upcoming appointments</h2>
      {upcoming.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            <p>No upcoming bookings.</p>
            <Button asChild className="mt-4">
              <Link href="/book">Book a session</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {upcoming.map((b) => (
            <Card key={b.id}>
              <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant="success">{b.status}</Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {b.reference}
                    </span>
                  </div>
                  <div className="font-semibold mt-1">{b.service.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {format(b.startsAt, "EEE d MMM, h:mm a")} ·{" "}
                    {b.variant.durationMin} min
                    {b.therapist?.user.name ? ` · with ${b.therapist.user.name}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium">
                    {formatPrice(b.priceCentsAtBooking)}
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/portal/bookings`}>Manage</Link>
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
