import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { RemoveWaitlistButton } from "./remove-button";

export const metadata = { title: "Waitlist" };
export const dynamic = "force-dynamic";

// WAITING entries first (need action / are still live), then most-recently
// notified, so staff see who's still owed a call before older history.
const STATUS_PRIORITY: Record<string, number> = {
  WAITING: 0,
  NOTIFIED: 1,
  REMOVED: 2,
};

export default async function WaitlistPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/staff/waitlist");
  if (session.user.role !== "STAFF" && session.user.role !== "ADMIN") {
    redirect("/staff");
  }

  const entriesRaw = await db.waitlistEntry.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { service: { select: { name: true } } },
  });
  const entries = [...entriesRaw].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 9;
    const pb = STATUS_PRIORITY[b.status] ?? 9;
    if (pa !== pb) return pa - pb;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return (
    <StaffShell
      user={session.user}
      topbar={<span className="text-foreground font-medium">Waitlist</span>}
    >
      <div className="p-4 space-y-4">
        <header>
          <h1 className="text-2xl font-bold">Waitlist</h1>
          <p className="text-sm text-muted-foreground">
            Customers waiting to be notified if a spot opens up on a fully-booked day. Notification is automatic on cancellation/no-show — this list is for reference and manual follow-up (e.g. calling someone directly).
          </p>
        </header>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
                  <tr className="text-left">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Treatment</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="px-4 py-3 whitespace-nowrap">
                        {format(parseISO(e.date), "EEE d MMM yyyy")}
                      </td>
                      <td className="px-4 py-3">{e.service.name}</td>
                      <td className="px-4 py-3">{e.guestName}</td>
                      <td className="px-4 py-3">
                        <div>{e.guestEmail}</div>
                        <div className="text-xs text-muted-foreground">{e.guestPhone}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            e.status === "WAITING"
                              ? "warning"
                              : e.status === "NOTIFIED"
                                ? "success"
                                : "secondary"
                          }
                        >
                          {e.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {format(e.createdAt, "d MMM yyyy")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {e.status !== "REMOVED" && <RemoveWaitlistButton id={e.id} />}
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                        No one on the waitlist yet.
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
