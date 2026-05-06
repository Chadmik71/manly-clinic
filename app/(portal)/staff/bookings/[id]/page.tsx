import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { sydneyDateLong, sydneyTimeShort, SYDNEY_TZ } from "@/lib/time";
import { formatPrice, therapistInternalName } from "@/lib/utils";
import { StatusActions } from "./status-actions";
import { setBookingStatus, updateBookingNotes, assignTherapist } from "./actions";
import { ClinicalNotesForm } from "./clinical-notes-form";
import { AssignTherapistForm } from "./assign-therapist-form";
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
      noteAuthor: { select: { name: true } },
    },
  });
  if (!b) notFound();

  const intake = await db.intakeForm.findFirst({
    where: { userId: b.clientId },
    orderBy: { updatedAt: "desc" },
  });

  // For remedial-massage bookings only, fetch all active therapists so the
  // staff can reassign. Empty list for other services skips the query.
  // Staff pool for the audit-side "who actually did the session" assignment.
  // All STAFF and ADMIN users (regardless of whether they have a Therapist
  // record) can be assigned. The assigned name is denormalised onto the
  // booking so historical assignments stay frozen even if the User is
  // renamed later.
  const staffPool = await db.user.findMany({
    where: { role: { in: ["STAFF", "ADMIN"] } },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
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
      <div className="flex justify-end gap-2 mb-4">
        <Link
          href={`/staff/bookings/${b.id}/edit`}
          className="text-sm rounded-md border px-3 py-1.5 hover:bg-accent"
        >
          Edit booking
        </Link>
        <a
          href={`/api/bookings/${b.id}/invoice`}
          target="_blank"
          rel="noreferrer"
          className="text-sm rounded-md border px-3 py-1.5 hover:bg-accent"
        >
          Download invoice (PDF)
        </a>
      </div>

      {/* Health-fund + unassigned + not-yet-completed warning. Matching
          server-side enforcement lives in setBookingStatus — this banner
          is the polite heads-up so staff don't click "Mark complete" then
          bounce off an error. */}
      {b.claimWithHealthFund && !b.assignedTherapistId && b.status !== "COMPLETED" && b.status !== "CANCELLED" && b.status !== "NO_SHOW" && (
        <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <strong className="font-semibold">Therapist assignment required.</strong>{" "}
          This is a health-fund-rebate booking. Before it can be marked as
          COMPLETED, assign the staff member who actually performed the session
          in the &ldquo;Therapist (assigned for clinical record)&rdquo; card below.
        </div>
      )}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Appointment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Status" value={<Badge variant={statusVariant(b.status)}>{b.status}</Badge>} />
            <Row label="Service" value={b.service.name} />
            <Row label="Duration" value={`${b.variant.durationMin} min`} />
            <Row label="Date" value={sydneyDateLong(b.startsAt)} />
            <Row label="Time" value={`${sydneyTimeShort(b.startsAt)} – ${sydneyTimeShort(b.endsAt)}`} />
            <Row label="Therapist" value={b.therapist ? therapistInternalName(b.therapist) : "Unassigned"} />
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
            <Row label="Member since" value={new Intl.DateTimeFormat("en-AU", { timeZone: SYDNEY_TZ, day: "numeric", month: "short", year: "numeric" }).format(b.client.createdAt)} />
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
                    value={new Intl.DateTimeFormat("en-AU", { timeZone: SYDNEY_TZ, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }).format(intake.signedAt ?? intake.createdAt)}
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
            <CardTitle>Treatment notes (clinical)</CardTitle>
          </CardHeader>
          <CardContent>
            <ClinicalNotesForm
              bookingId={b.id}
              initial={{
                subjective: b.noteSubjective ?? "",
                objective: b.noteObjective ?? "",
                assessment: b.noteAssessment ?? "",
                plan: b.notePlan ?? "",
                areasTreated: b.noteAreasTreated ?? "",
                techniques: b.noteTechniques ?? "",
                outcome: b.noteOutcome ?? "",
              }}
              authorName={b.noteAuthor?.name ?? null}
              updatedAt={b.noteUpdatedAt}
              action={updateBookingNotes}
            />
          </CardContent>
        </Card>

                <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Therapist (assigned for clinical record)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Pick the staff member who actually performed (or will perform) this session. This name appears on the audit-friendly clinical record export and on health-fund claims. Customers always see the slot label they booked &mdash; never this name.
            </p>
            <AssignTherapistForm
              bookingId={b.id}
              currentAssignedId={b.assignedTherapistId}
              currentAssignedName={b.assignedTherapistName}
              staffOptions={staffPool.map((u) => ({
                id: u.id,
                name: u.name ?? "(no name)",
                role: u.role,
              }))}
              action={assignTherapist}
            />
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
