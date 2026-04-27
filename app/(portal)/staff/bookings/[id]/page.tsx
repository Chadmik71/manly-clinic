import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { formatPrice } from "@/lib/utils";
import { StatusActions } from "./status-actions";
import { setBookingStatus } from "./actions";
import { parseHistory, historyLabel } from "@/lib/intake";

export default async function StaffBookingDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = (await auth())!;
  const { id } = await params;
  const b = await db.booking.findUnique({
    where: { id },
    include: {
      service: true,
      variant: true,
      client: true,
      therapist: { include: { user: true } },
    },
  });
  if (!b) notFound();

  const intake = await db.intakeForm.findFirst({
    where: { userId: b.clientId },
    orderBy: { updatedAt: "desc" },
  });

  // Audit: staff viewed health information
  if (intake) {
    await audit({
      userId: session.user.id,
      action: "VIEW_HEALTH_INFO",
      resource: `IntakeForm:${intake.id}`,
      metadata: { booking: b.reference },
    });
  }

  return (
    <StaffShell
      user={session.user}
      topbar={
        <span className="flex items-center gap-2">
          <Link href="/staff/bookings" className="text-muted-foreground hover:text-foreground">
            Bookings
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono text-foreground">{b.reference}</span>
        </span>
      }
    >
      <div className="p-4">
      <div className="flex justify-end mb-4">
        <a
          href={`/api/bookings/${b.id}/invoice`}
          target="_blank"
          rel="noreferrer"
          className="text-sm rounded-md border px-3 py-1.5 hover:bg-accent"
        >
          Download invoice (PDF)
        </a>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Appointment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Status" value={<Badge variant={statusVariant(b.status)}>{b.status}</Badge>} />
            <Row label="Service" value={b.service.name} />
            <Row label="Duration" value={`${b.variant.durationMin} min`} />
            <Row label="Date" value={format(b.startsAt, "EEEE d MMMM yyyy")} />
            <Row label="Time" value={`${format(b.startsAt, "h:mm a")} – ${format(b.endsAt, "h:mm a")}`} />
            <Row label="Therapist" value={b.therapist?.user.name ?? "Unassigned"} />
            <Row label="Price" value={formatPrice(b.priceCentsAtBooking)} />
            <Row
              label="Health fund claim"
              value={
                b.claimWithHealthFund ? (
                  <Badge variant="success">Yes</Badge>
                ) : (
                  "No"
                )
              }
            />
            {b.notes && <Row label="Notes" value={b.notes} />}
          </CardContent>
        </Card>

        {b.claimWithHealthFund && intake?.healthFundName && (
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Health fund details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <Field label="Health fund" value={intake.healthFundName ?? "—"} />
              <Field
                label="Member number"
                value={intake.healthFundMemberNumber ?? "—"}
              />
              <Field
                label="Reason for treatment"
                value={intake.reasonForTreatment ?? "—"}
                full
              />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Client</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Name" value={b.client.name} />
            <Row label="Email" value={<a className="underline" href={`mailto:${b.client.email}`}>{b.client.email}</a>} />
            <Row label="Phone" value={b.client.phone ?? "—"} />
            <Row label="Member since" value={format(b.client.createdAt, "d MMM yyyy")} />
            <div className="pt-2">
              <Link href={`/staff/clients/${b.client.id}`} className="text-primary hover:underline text-sm">
                Open client profile →
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Latest health intake</CardTitle>
          </CardHeader>
          <CardContent>
            {intake ? (
              <div className="space-y-5">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <Field
                    label="Submitted"
                    value={format(intake.signedAt ?? intake.createdAt, "d MMM yyyy, h:mm a")}
                  />
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
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                    Medical history
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {parseHistory(intake.medicalHistory).length === 0 ? (
                      <span className="text-sm text-muted-foreground">None</span>
                    ) : (
                      parseHistory(intake.medicalHistory).map((c) => (
                        <Badge key={c} variant="secondary">
                          {historyLabel(c)}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <Field
                    label="Other conditions / detail"
                    value={intake.medicalConditions ?? "—"}
                    full
                  />
                  <Field label="Medications" value={intake.medications ?? "—"} />
                  <Field label="Allergies" value={intake.allergies ?? "—"} />
                  <Field label="Pain location" value={intake.painLocation ?? "—"} />
                  <Field
                    label="Pain (0-10)"
                    value={intake.painScale != null ? String(intake.painScale) : "—"}
                  />
                  <Field label="Pain onset" value={intake.painOnset ?? "—"} />
                  <Field
                    label="Pain history / previous treatment"
                    value={intake.painHistory ?? "—"}
                    full
                  />
                  <Field
                    label="Treatment goals"
                    value={intake.treatmentGoals ?? "—"}
                    full
                  />
                  <Field
                    label="Injuries / areas to avoid"
                    value={intake.injuries ?? "—"}
                    full
                  />
                  <Field
                    label="Emergency contact"
                    value={
                      [
                        intake.emergencyContactName,
                        intake.emergencyContactRelationship,
                        intake.emergencyContactPhone,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"
                    }
                    full
                  />
                </dl>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No intake on file.</p>
            )}
            <p className="text-xs text-muted-foreground mt-4">
              Access to this record is audit-logged under your staff account.
            </p>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Update status</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusActions id={b.id} current={b.status} action={setBookingStatus} />
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
      <span className="text-right">{value}</span>
    </div>
  );
}
function Field({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{value}</dd>
    </div>
  );
}
function statusVariant(s: string): "success" | "destructive" | "warning" | "secondary" {
  if (s === "CONFIRMED") return "success";
  if (s === "CANCELLED") return "destructive";
  if (s === "NO_SHOW") return "warning";
  return "secondary";
}
