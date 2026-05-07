import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { StaffShell } from "@/components/staff-shell";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { parseHistory, historyLabel } from "@/lib/intake";
import { BodyDiagram } from "@/components/body-diagram";
import { zoneLabel } from "@/lib/body-diagram-zones";

/**
 * Per-client intake history. Lists every IntakeForm row submitted by this
 * client in reverse chronological order, each with the body diagram
 * (read-only) and signature image (when captured) inline. Useful when
 * staff need to see how a client's complaint or affected zones evolved
 * across visits without opening every single booking.
 */
export default async function ClientIntakeHistory({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = (await auth())!;
  const { id } = await params;

  const client = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, role: true, email: true },
  });
  if (!client || client.role !== "CLIENT") notFound();

  const intakes = await db.intakeForm.findMany({
    where: { userId: client.id },
    orderBy: [{ signedAt: "desc" }, { createdAt: "desc" }],
    take: 50,
  });

  await audit({
    userId: session.user.id,
    action: "VIEW_INTAKE_HISTORY",
    resource: `User:${client.id}`,
    metadata: { count: intakes.length },
  });

  return (
    <StaffShell
      user={session.user}
      topbar={
        <span className="flex items-center gap-2">
          <Link href="/staff/clients" className="text-muted-foreground hover:text-foreground">
            Clients
          </Link>
          <span className="text-muted-foreground">/</span>
          <Link
            href={`/staff/clients/${client.id}`}
            className="text-muted-foreground hover:text-foreground"
          >
            {client.name}
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground font-medium">Intake history</span>
        </span>
      }
    >
      <div className="p-4">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Intake history</h1>
          <p className="text-sm text-muted-foreground">
            {intakes.length === 0
              ? "No intakes on file"
              : `${intakes.length} submission${intakes.length === 1 ? "" : "s"} (newest first)`}
          </p>
        </div>

        {intakes.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              This client has no intake forms on record yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {intakes.map((intake) => {
              const codes = parseHistory(intake.painLocationCodes);
              const history = parseHistory(intake.medicalHistory);
              const submitted = intake.signedAt ?? intake.createdAt;
              return (
                <Card key={intake.id}>
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                    <div>
                      <CardTitle className="text-base">
                        {format(submitted, "EEEE d MMMM yyyy")}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {format(submitted, "h:mm a")}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {intake.healthFundName ? (
                        <Badge variant="success">Health fund claim</Badge>
                      ) : null}
                      {intake.pregnancy ? (
                        <Badge variant="secondary">
                          {intake.pregnancyWeeks ? `Pregnant — ${intake.pregnancyWeeks} wk` : "Pregnant"}
                        </Badge>
                      ) : null}
                      {intake.signatureDataUrl ? (
                        <Badge variant="outline">Signed</Badge>
                      ) : null}
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-5 lg:grid-cols-3">
                    {/* Left two columns: text fields */}
                    <div className="lg:col-span-2 space-y-4 text-sm">
                      {history.length > 0 && (
                        <div>
                          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                            Medical history
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {history.map((c) => (
                              <Badge key={c} variant="secondary">
                                {historyLabel(c)}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      <dl className="grid gap-3 sm:grid-cols-2">
                        <Field label="Medications" value={intake.medications} />
                        <Field label="Allergies" value={intake.allergies} />
                        <Field label="Injuries / areas to avoid" value={intake.injuries} full />
                        <Field label="Pain location" value={intake.painLocation} />
                        <Field
                          label="Pain (0-10)"
                          value={intake.painScale != null ? String(intake.painScale) : null}
                        />
                        <Field label="Treatment goals" value={intake.treatmentGoals} full />
                        {intake.healthFundName && (
                          <Field
                            label="Health fund"
                            value={`${intake.healthFundName} · Member ${intake.healthFundMemberNumber ?? "—"}`}
                            full
                          />
                        )}
                      </dl>
                    </div>
                    {/* Right column: diagram + signature */}
                    <div className="space-y-4">
                      {codes.length > 0 ? (
                        <div>
                          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                            Focus areas
                          </div>
                          <div className="rounded-md border bg-card p-2">
                            <BodyDiagram initialCodes={codes} readOnly />
                          </div>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            {codes.map(zoneLabel).join(", ")}
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          No body-diagram zones marked on this visit.
                        </p>
                      )}
                      {intake.signatureDataUrl ? (
                        <div>
                          <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">
                            Signature
                          </div>
                          <div className="rounded-md border bg-white p-2 inline-block">
                            <img
                              src={intake.signatureDataUrl}
                              alt="Patient signature"
                              className="block h-auto"
                              style={{ maxHeight: 80, maxWidth: "100%" }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-6">
          Access to these records is audit-logged under your staff account.
        </p>
      </div>
    </StaffShell>
  );
}

function Field({
  label,
  value,
  full,
}: {
  label: string;
  value: string | null;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 whitespace-pre-wrap">
        {value && value.trim() ? value : "—"}
      </dd>
    </div>
  );
}
