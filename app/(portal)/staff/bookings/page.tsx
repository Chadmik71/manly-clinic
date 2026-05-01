import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatPrice, therapistInternalName } from "@/lib/utils";
import { format } from "date-fns";

export const metadata = { title: "All bookings" };

export default async function StaffBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const session = (await auth())!;
  const sp = await searchParams;
  const q = sp.q?.trim();
  const status = sp.status;

  const bookings = await db.booking.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { reference: { contains: q } },
              { client: { name: { contains: q } } },
              { client: { email: { contains: q } } },
            ],
          }
        : {}),
    },
    include: {
      service: { select: { name: true } },
      variant: { select: { durationMin: true } },
      client: { select: { name: true, email: true } },
      therapist: { include: { user: { select: { name: true } } } },
    },
    orderBy: { startsAt: "desc" },
    take: 100,
  });

  const statuses = ["", "PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];

  return (
    <StaffShell
      user={session.user}
      topbar={<span className="text-foreground font-medium">All bookings</span>}
    >
      <div className="p-4 space-y-4">
        <div className="flex justify-end">
          <Button asChild>
            <Link href="/staff/bookings/new">+ New booking</Link>
          </Button>
        </div>
        <form className="flex flex-wrap gap-2">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search reference, client name or email…"
            className="max-w-sm"
          />
          <select
            name="status"
            defaultValue={status ?? ""}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s || "All statuses"}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline">Filter</Button>
        </form>

        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
                  <tr className="text-left">
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Ref</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Therapist</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {bookings.map((b) => (
                    <tr key={b.id} className="border-t">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {format(b.startsAt, "d MMM yyyy")}
                        <div className="text-xs text-muted-foreground">
                          {format(b.startsAt, "h:mm a")} · {b.variant.durationMin}m
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{b.reference}</td>
                      <td className="px-4 py-3">
                        <div>{b.client.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {b.client.email}
                        </div>
                      </td>
                      <td className="px-4 py-3">{b.service.name}</td>
                      <td className="px-4 py-3">{b.therapist ? therapistInternalName(b.therapist) : "—"}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            b.status === "CONFIRMED"
                              ? "success"
                              : b.status === "CANCELLED"
                                ? "destructive"
                                : b.status === "NO_SHOW"
                                  ? "warning"
                                  : "secondary"
                          }
                        >
                          {b.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {formatPrice(b.priceCentsAtBooking)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/staff/bookings/${b.id}`}
                          className="text-primary hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {bookings.length === 0 && (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-10 text-center text-muted-foreground"
                      >
                        No bookings match your filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </StaffShell>
  );
}
