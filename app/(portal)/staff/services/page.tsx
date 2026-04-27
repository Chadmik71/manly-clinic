import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDuration, formatPrice, categoryLabel } from "@/lib/utils";

export const metadata = { title: "Services" };

export default async function StaffServicesPage() {
  const session = (await auth())!;
  const services = await db.service.findMany({
    include: { variants: { orderBy: { durationMin: "asc" } } },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return (
    <StaffShell
      user={session.user}
      topbar={<span className="text-foreground font-medium">Services</span>}
    >
      <div className="p-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        Services and pricing visible to clients. Edit via{" "}
        <code>prisma/seed.ts</code> and re-run the seed, or use Prisma Studio
        (<code>npm run db:studio</code>).
      </p>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
                <tr className="text-left">
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Variants</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id} className="border-t align-top">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3">{categoryLabel(s.category)}</td>
                    <td className="px-4 py-3">
                      <ul className="space-y-0.5">
                        {s.variants.map((v) => (
                          <li key={v.id} className="text-xs text-muted-foreground">
                            {formatDuration(v.durationMin)} · {formatPrice(v.priceCents)}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={s.active ? "success" : "secondary"}>
                        {s.active ? "active" : "inactive"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      </div>
    </StaffShell>
  );
}
