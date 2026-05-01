import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { formatPrice, therapistInternalName } from "@/lib/utils";

export default async function ClientProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = (await auth())!;
  const { id } = await params;
  const client = await db.user.findUnique({
    where: { id },
    include: {
      bookings: {
        include: { service: true, variant: true, therapist: { include: { user: true } } },
        orderBy: { startsAt: "desc" },
        take: 50,
      },
      intakeForms: { orderBy: { updatedAt: "desc" }, take: 1 },
    },
  });
  if (!client || client.role !== "CLIENT") notFound();
  await audit({
    userId: session.user.id,
    action: "VIEW_CLIENT_PROFILE",
    resource: `User:${id}`,
  });
  const intake = client.intakeForms[0];

  return (
    <StaffShell
      user={session.user}
      topbar={
        <span className="flex items-center gap-2">
          <Link href="/staff/clients" className="text-muted-foreground hover:text-foreground">
            Clients
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground font-medium">{client.name}</span>
        </span>
      }
    >
      <div className="p-4">
        <div className="flex justify-end mb-4">
          <Link
            href={`/staff/clients/${id}/record`}
            className="text-sm rounded-md border px-3 py-1.5 hover:bg-accent"
          >
            View clinical record (audit-friendly)
          </Link>
        </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Contact</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row
              label="Email"
              value={
                client.email.endsWith("@clinic.local") ? (
                  <span className="text-muted-foreground italic">no email on file</span>
                ) : (
                  client.email
                )
              }
            />
            <Row label="Phone" value={client.phone ?? "—"} />
            <Row label="Member since" value={format(client.createdAt, "d MMM yyyy")} />
            <Row
              label="Visits"
              value={`${client.visitCount + client.bookings.filter((b) => b.status === "COMPLETED").length}${client.visitCount > 0 ? ` (${client.visitCount} imported)` : ""}`}
            />
            <Row
              label="No-shows"
              value={
                client.noShowCount > 0 ? (
                  <Badge variant="warning">{client.noShowCount}</Badge>
                ) : (
                  "0"
                )
              }
            />
            {client.notes && (
              <div>
                <div className="text-muted-foreground text-xs uppercase tracking-wide mt-3">
                  Notes (imported)
                </div>
                <p className="whitespace-pre-wrap mt-1">{client.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Latest intake</CardTitle></CardHeader>
          <CardContent>
            {intake ? (
              <dl className="grid gap-2 text-sm">
                <Field label="Submitted" value={format(intake.signedAt ?? intake.createdAt, "d MMM yyyy")} />
                <Field label="Medical conditions" value={intake.medicalConditions ?? "—"} />
                <Field label="Medications" value={intake.medications ?? "—"} />
                <Field label="Allergies" value={intake.allergies ?? "—"} />
                <Field label="Injuries" value={intake.injuries ?? "—"} />
                <Field
                  label="Pregnancy"
                  value={
                    intake.pregnancy
                      ? intake.pregnancyWeeks
                        ? `Yes — ${intake.pregnancyWeeks} weeks`
                        : "Yes"
                      : "No"
                  }
                />
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">No intake on file.</p>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader><CardTitle>Booking history</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
                  <tr className="text-left">
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Therapist</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {client.bookings.map((b) => (
                    <tr key={b.id} className="border-t">
                      <td className="px-4 py-3">{format(b.startsAt, "d MMM yyyy h:mm a")}</td>
                      <td className="px-4 py-3">
                        <Link href={`/staff/bookings/${b.id}`} className="hover:underline">
                          {b.service.name} ({b.variant.durationMin}m)
                        </Link>
                      </td>
                      <td className="px-4 py-3">{b.therapist ? therapistInternalName(b.therapist) : "—"}</td>
                      <td className="px-4 py-3"><Badge variant="secondary">{b.status}</Badge></td>
                      <td className="px-4 py-3 text-right">{formatPrice(b.priceCentsAtBooking)}</td>
                    </tr>
                  ))}
                  {client.bookings.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                        No bookings yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </StaffShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right break-all">{value}</span>
    </div>
  );
}
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
