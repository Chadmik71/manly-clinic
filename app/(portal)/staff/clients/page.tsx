import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export const metadata = { title: "Clients" };

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const session = (await auth())!;
  const sp = await searchParams;
  const q = sp.q?.trim();
  const sort = sp.sort ?? "name";

  // Multi-token search. Each whitespace-separated token must match at least
  // one indexed field — so "John 0412" finds John whose phone contains 0412.
  // Phone tokens with whitespace/punctuation are stripped to digits before
  // matching against stored phones (which are already normalized).
  const tokens = (q ?? "")
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const where = {
    role: "CLIENT" as const,
    ...(tokens.length > 0
      ? {
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
                {
                  bookings: {
                    some: { reference: { contains: t.toUpperCase() } },
                  },
                },
                {
                  intakeForms: {
                    some: { healthFundMemberNumber: { contains: t } },
                  },
                },
              ],
            };
          }),
        }
      : {}),
  };

  const orderBy =
    sort === "visits"
      ? { visitCount: "desc" as const }
      : sort === "noshows"
        ? { noShowCount: "desc" as const }
        : sort === "joined"
          ? { createdAt: "desc" as const }
          : { name: "asc" as const };

  const [clients, total] = await Promise.all([
    db.user.findMany({
      where,
      include: { _count: { select: { bookings: true } } },
      orderBy,
      take: 200,
    }),
    db.user.count({ where }),
  ]);

  return (
    <StaffShell
      user={session.user}
      topbar={<span className="text-foreground font-medium">Clients</span>}
    >
      <div className="p-4 space-y-4">
        <form className="flex flex-wrap gap-2 items-center">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Name, email, phone, suburb, ref, member no…"
            className="max-w-md"
            autoComplete="off"
          />
          <select
            name="sort"
            defaultValue={sort}
            className="h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value="name">Sort: Name</option>
            <option value="visits">Sort: Most visits</option>
            <option value="noshows">Sort: Most no-shows</option>
            <option value="joined">Sort: Recently joined</option>
          </select>
          <Button type="submit" variant="outline">
            Apply
          </Button>
          {q && (
            <Button asChild variant="ghost" size="sm">
              <Link href="/staff/clients">Clear</Link>
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {total.toLocaleString()} client{total === 1 ? "" : "s"}
            {clients.length < total ? ` · showing ${clients.length}` : ""}
          </span>
        </form>
        <p className="text-xs text-muted-foreground -mt-2">
          Tip: combine words to narrow — e.g. <code>john 0412</code>,{" "}
          <code>manly 2095</code>, or paste a booking reference like{" "}
          <code>MNL-A4F2K</code>.
        </p>
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
                    const synthetic = c.email.endsWith("@clinic.local");
                    return (
                      <tr key={c.id} className="border-t">
                        <td className="px-4 py-3 font-medium">{c.name}</td>
                        <td className="px-4 py-3">
                          {synthetic ? (
                            <span className="text-muted-foreground italic">
                              no email on file
                            </span>
                          ) : (
                            c.email
                          )}
                        </td>
                        <td className="px-4 py-3">{c.phone ?? "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {c.visitCount + c._count.bookings}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {c.noShowCount > 0 ? (
                            <Badge variant="warning">{c.noShowCount}</Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {format(c.createdAt, "d MMM yyyy")}
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/staff/clients/${c.id}`}
                            className="text-primary hover:underline"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {clients.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-10 text-center text-muted-foreground"
                      >
                        No clients found.
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
