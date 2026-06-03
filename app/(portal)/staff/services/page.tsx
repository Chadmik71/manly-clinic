import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDuration, formatPrice, categoryLabel } from "@/lib/utils";
import { ChevronUp, ChevronDown } from "lucide-react";
import { moveService } from "./actions";

export const metadata = { title: "Services" };

export default async function StaffServicesPage() {
  const session = (await auth())!;
  const isAdmin = session.user.role === "ADMIN";
  const services = await db.service.findMany({
    include: { variants: { orderBy: { durationMin: "asc" } } },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });

  return (
    <StaffShell
      user={session.user}
      topbar={<span className="text-foreground font-medium">Services</span>}
    >
      <div className="p-4 space-y-4">
      <p className="text-sm text-muted-foreground">
        Services and pricing visible to clients. {isAdmin
          ? "Use the arrows to set the order they appear in on the website (top of this list = shown first; the homepage Quick-booking box shows the top 4). Pricing/variants are still edited via the seed."
          : "Order and pricing are managed by an admin."}
      </p>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
                <tr className="text-left">
                  {isAdmin && <th className="px-2 py-3 w-px">Order</th>}
                  <th className="px-4 py-3">Service</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Variants</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s, i) => (
                  <tr key={s.id} className="border-t align-top">
                    {isAdmin && (
                      <td className="px-2 py-3">
                        <div className="flex flex-col gap-1">
                          <form action={moveService}>
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="dir" value="up" />
                            <button
                              type="submit"
                              disabled={i === 0}
                              aria-label={`Move ${s.name} up`}
                              className="grid h-6 w-6 place-items-center rounded border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              <ChevronUp className="h-4 w-4" />
                            </button>
                          </form>
                          <form action={moveService}>
                            <input type="hidden" name="id" value={s.id} />
                            <input type="hidden" name="dir" value="down" />
                            <button
                              type="submit"
                              disabled={i === services.length - 1}
                              aria-label={`Move ${s.name} down`}
                              className="grid h-6 w-6 place-items-center rounded border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                              <ChevronDown className="h-4 w-4" />
                            </button>
                          </form>
                        </div>
                      </td>
                    )}
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
