import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffShell } from "@/components/staff-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProfileForm } from "./profile-form";
import { AvailabilityForm } from "./availability-form";
import { TimeOffForm } from "./timeoff-form";
import {
  saveProfile,
  saveAvailability,
  addTimeOff,
  removeTimeOff,
} from "./actions";
import { format } from "date-fns";

export default async function TherapistEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = (await auth())!;
  const { id } = await params;
  const t = await db.therapist.findUnique({
    where: { id },
    include: {
      user: true,
      availability: { orderBy: { dayOfWeek: "asc" } },
      timeOff: { orderBy: { startsAt: "asc" } },
    },
  });
  if (!t) notFound();

  return (
    <StaffShell
      user={session.user}
      topbar={
        <span className="flex items-center gap-2">
          <Link href="/staff/therapists" className="text-muted-foreground hover:text-foreground">
            Therapists
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground font-medium">{t.user.name}</span>
        </span>
      }
    >
      <div className="p-4 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Profile</CardTitle>
              <Badge variant={t.active ? "success" : "secondary"}>
                {t.active ? "active" : "inactive"}
              </Badge>
            </div>
            <CardDescription>
              Provider number is required on tax invoices for health-fund rebates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              action={saveProfile}
              defaults={{
                id: t.id,
                bio: t.bio ?? "",
                qualifications: t.qualifications ?? "",
                providerNumber: t.providerNumber ?? "",
                associationName: t.associationName ?? "",
                active: t.active,
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Weekly availability</CardTitle>
            <CardDescription>
              Hours therapist is available each day. Bookings still respect the
              clinic-wide 9 am – 8 pm window.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AvailabilityForm
              action={saveAvailability}
              therapistId={t.id}
              availability={t.availability.map((a) => ({
                dayOfWeek: a.dayOfWeek,
                startMin: a.startMin,
                endMin: a.endMin,
              }))}
            />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Time off</CardTitle>
            <CardDescription>
              Block out leave / personal days. Existing bookings during this
              window are NOT auto-cancelled — handle those manually.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <TimeOffForm
              addAction={addTimeOff}
              therapistId={t.id}
            />
            <ul className="divide-y rounded-md border">
              {t.timeOff.length === 0 ? (
                <li className="p-3 text-sm text-muted-foreground">No time off scheduled.</li>
              ) : (
                t.timeOff.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-3 p-3 text-sm"
                  >
                    <div>
                      <div className="font-medium">
                        {format(o.startsAt, "d MMM yyyy h:mm a")} →{" "}
                        {format(o.endsAt, "d MMM yyyy h:mm a")}
                      </div>
                      {o.reason && (
                        <div className="text-xs text-muted-foreground">{o.reason}</div>
                      )}
                    </div>
                    <form action={removeTimeOff}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="therapistId" value={t.id} />
                      <button
                        type="submit"
                        className="text-xs text-destructive hover:underline"
                      >
                        Remove
                      </button>
                    </form>
                  </li>
                ))
              )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </StaffShell>
  );
}
