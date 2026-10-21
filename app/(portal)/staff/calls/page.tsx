import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent } from "@/components/ui/card";
import { sydneyDateMedium, sydneyTimeShort } from "@/lib/time";
import { callLength, callOutcome } from "@/lib/phone-agent/transcript";
import { OutcomeBadge } from "./outcome-badge";

export const metadata = { title: "Phone calls" };
export const dynamic = "force-dynamic";

export default async function CallsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/staff/calls");
  if (session.user.role !== "STAFF" && session.user.role !== "ADMIN") redirect("/staff");

  const calls = await db.phoneCall.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  await audit({ userId: session.user.id, action: "VIEW_PHONE_CALLS", metadata: { count: calls.length } });

  return (
    <StaffShell user={session.user} topbar={<span className="text-foreground font-medium">Phone calls</span>}>
      <div className="p-4 space-y-4">
        <header>
          <h1 className="text-2xl font-bold">Phone calls</h1>
          <p className="text-sm text-muted-foreground">
            Calls answered by the phone assistant, newest first. Open a call to read the conversation.
          </p>
        </header>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
                  <tr className="text-left">
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Caller</th>
                    <th className="px-4 py-3">Length</th>
                    <th className="px-4 py-3">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map((c) => (
                    <tr key={c.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <Link href={`/staff/calls/${c.id}`} className="hover:underline">
                          {sydneyDateMedium(c.createdAt)}, {sydneyTimeShort(c.createdAt)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{c.fromPhone ?? "Hidden number"}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{callLength(c)}</td>
                      <td className="px-4 py-3">
                        <OutcomeBadge outcome={callOutcome(c)} />
                      </td>
                    </tr>
                  ))}
                  {calls.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                        No calls yet. Calls appear here once the phone assistant is switched on.
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
