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

export default async function NewStaffBookingPage({
  searchParams,
}: {
  searchParams: Promise<{
    date?: string;
    time?: string;
    therapistId?: string;
  }>;
}) {
  const session = (await auth())!;
  const sp = await searchParams;

  // When the user clicks an empty slot on /staff/schedule, the grid navigates
  // here with date=YYYY-MM-DD, time=HH:mm, and therapistId in the query string.
  // Translate those into props for the form.
  const dateOk = !!sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date);
  const timeOk = !!sp.time && /^\d{2}:\d{2}$/.test(sp.time);
  const initialStartsAt = dateOk
    ? `${sp.date}T${timeOk ? sp.time : "09:00"}`
    : undefined;
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
                healthFundEligible: s.healthFundEligible,
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
              initialStartsAt={initialStartsAt}
              initialTherapistId={sp.therapistId}
            />
          </CardContent>
        </Card>
      </div>
    </StaffShell>
  );
}
