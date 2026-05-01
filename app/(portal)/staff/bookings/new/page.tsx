import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { therapistInternalName } from "@/lib/utils";
import { StaffShell } from "@/components/staff-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NewBookingForm } from "./form";
import { createStaffBooking } from "./actions";

export const metadata = { title: "New booking" };

export default async function NewStaffBookingPage() {
  const session = (await auth())!;
  const [services, therapists, clients] = await Promise.all([
    db.service.findMany({
      where: { active: true },
      include: { variants: { orderBy: { durationMin: "asc" } } },
      orderBy: { name: "asc" },
    }),
    db.therapist.findMany({
      where: { active: true },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    db.user.findMany({
      where: { role: "CLIENT" },
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { name: "asc" },
      take: 500,
    }),
  ]);

  return (
    <StaffShell
      user={session.user}
      topbar={
        <span className="text-foreground font-medium">New booking</span>
      }
    >
      <div className="p-4 max-w-3xl">
        <Card>
          <CardHeader>
            <CardTitle>Create a booking</CardTitle>
            <CardDescription>
              For phone-in clients or walk-ins. The clinic-wide 9 am – 8 pm
              window still applies.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NewBookingForm
              action={createStaffBooking}
              clients={clients}
              services={services.map((s) => ({
                id: s.id,
                name: s.name,
                variants: s.variants.map((v) => ({
                  id: v.id,
                  durationMin: v.durationMin,
                  priceCents: v.priceCents,
                })),
              }))}
              therapists={therapists.map((t) => ({
                id: t.id,
                name: therapistInternalName(t),
              }))}
            />
          </CardContent>
        </Card>
      </div>
    </StaffShell>
  );
}
