import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ClientsSearch } from "./clients-search";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string }>; }) {
  const session = (await auth())!;
  const sp = await searchParams;
  const q = sp.q?.trim();
  const sort = sp.sort ?? "name";

  const tokens = (q ?? "").split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);

  const where = {
    role: "CLIENT" as const,
    ...(tokens.length > 0 ? {
      AND: tokens.map((t) => {
        const digits = t.replace(/[^\d+]/g, "");
        return {
          OR: [
            { name: { contains: t } },
            { email: { contains: t } },
            { phone: { contains: digits || t } },
            { extern
@'
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ClientsSearch } from "./clients-search";

export const metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string }>; }) {
  const session = (await auth())!;
  const sp = await searchParams;
  const q = sp.q?.trim();
  const sort = sp.sort ?? "name";

  const tokens = (q ?? "").split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);

  const where = {
    role: "CLIENT" as const,
    ...(tokens.length > 0 ? {
      AND: tokens.map((t) => {
        const digits = t.replace(/[^\d+]/g, "");
        return {
          OR: [
            { name: { contains: t } },
            { email: { contains: t } },
            { phone: { contains: digits || t } },
            { externalId: { contains: t } },
            { suburb: { contains: t } },
            { postcode: { contains: t } },
            { notes: { contains: t } },
            { bookings: { some: { reference: { contains: t.toUpperCase() } } } },
            { intakeForms: { some: { healthFundMemberNumber: { contains: t } } } },
          ],
        };
      }),
    } : {}),
  };

  const orderBy =
    sort === "visits" ? { visitCount: "desc" as const } :
    sort === "noshows" ? { noShowCount: "desc" as const } :
    sort === "joined" ? { createdAt: "desc" as const } :
    { name: "asc" as const };

  const [clients, total] = await Promise.all([
    db.user.findMany({ where, include: { _count: { select: { bookings: true } } }, orderBy, take: 200 }),
    db.user.count({ where }),
  ]);

  return (
    <StaffShell user={session.user} topbar={<span className="text-foreground font-medium">Clients</span>}>
      <div className="p-4 space-y-4">
        <ClientsSearch defaultQ={q} defaultSort={sort} total={total} showing={clients.length} />
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
                  <tr className="text-left">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3 text-right">Visits</th>
                    <th className="px-4 py-3 text-right">No-shows</th>
                    <th className="px-4 py-3">Joined</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => {
                    const synthetic = c.email.endsWith("@clinic.local") || c.email.includes("@manlyremedialthai.com.au");
                    return (
                      <tr key={c.id} className="border-t">
                        <td className="px-4 py-3 font-medium">{c.name}</td>
                        <td className="px-4 py-3">
                          {synthetic ? <span className="text-muted-foreground italic">no email on file</span> : c.email}
                        </td>
                        <td className="px-4 py-3">{c.phone ?? "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{c.visitCount + c._count.bookings}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {c.noShowCount > 0 ? <Badge variant="warning">{c.noShowCount}</Badge> : <span className="text-muted-foreground">0</span>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">{format(c.createdAt, "d MMM yyyy")}</td>
                        <td className="px-4 py-3">
                          <Link href={`/staff/clients/${c.id}`} className="text-primary hover:underline">Open</Link>
                        </td>
                      </tr>
                    );
                  })}
                  {clients.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No clients found.</td></tr>
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
