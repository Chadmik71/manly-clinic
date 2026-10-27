import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDuration, formatPrice, categoryLabel } from "@/lib/utils";
import { ChevronUp, ChevronDown } from "lucide-react";
import { moveService } from "./actions";
import { AddServiceForm, ServiceEditor } from "./service-editors";

export const metadata = { title: "Services" };
export const dynamic = "force-dynamic";

function OrderControls({ id, name, first, last }: { id: string; name: string; first: boolean; last: boolean }) {
  const btn =
    "grid h-6 w-6 place-items-center rounded border text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";
  return (
    <div className="flex flex-col gap-1">
      <form action={moveService}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="dir" value="up" />
        <button type="submit" disabled={first} aria-label={`Move ${name} up`} className={btn}>
          <ChevronUp className="h-4 w-4" />
        </button>
      </form>
      <form action={moveService}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="dir" value="down" />
        <button type="submit" disabled={last} aria-label={`Move ${name} down`} className={btn}>
          <ChevronDown className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

export default async function StaffServicesPage() {
  const session = (await auth())!;
  const isAdmin = session.user.role === "ADMIN";
  const services = await db.service.findMany({
    include: { variants: { orderBy: { durationMin: "asc" } } },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });

  return (
    <StaffShell user={session.user} topbar={<span className="text-foreground font-medium">Services</span>}>
      <div className="p-4 space-y-4">
        {isAdmin ? (
          <>
            <p className="text-sm text-muted-foreground max-w-3xl">
              Treatments, lengths and prices shown on the website and in booking. Changes go live straight away. Use the
              arrows to set the order on the website (top = shown first; the homepage Quick-booking box shows the top 4).
              Changing a price never changes bookings already made. A hidden length or treatment disappears from the
              website and booking forms, but existing bookings keep it.
            </p>
            {services.map((s, i) => (
              <Card key={s.id}>
                <CardContent className="p-4">
                  <ServiceEditor
                    service={{
                      id: s.id,
                      name: s.name,
                      description: s.description ?? "",
                      category: s.category,
                      active: s.active,
                      healthFundEligible: s.healthFundEligible,
                      variants: s.variants.map((v) => ({
                        id: v.id,
                        durationMin: v.durationMin,
                        priceCents: v.priceCents,
                        active: v.active,
                      })),
                    }}
                    orderControls={
                      <OrderControls id={s.id} name={s.name} first={i === 0} last={i === services.length - 1} />
                    }
                  />
                </CardContent>
              </Card>
            ))}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Add a new treatment</CardTitle>
              </CardHeader>
              <CardContent>
                <AddServiceForm />
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Services and pricing visible to clients. Order and pricing are managed by an admin.
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
                              {s.variants
                                .filter((v) => v.active)
                                .map((v) => (
                                  <li key={v.id} className="text-xs text-muted-foreground">
                                    {formatDuration(v.durationMin)} · {formatPrice(v.priceCents)}
                                  </li>
                                ))}
                            </ul>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={s.active ? "success" : "secondary"}>{s.active ? "active" : "inactive"}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </StaffShell>
  );
}
