import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PortalShell } from "@/components/portal-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { format } from "date-fns";
import { parseHistory, historyLabel } from "@/lib/intake";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Intake form" };

export default async function IntakePage() {
  const session = (await auth())!;
  const intakes = await db.intakeForm.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
  });
  const latest = intakes[0];

  return (
    <PortalShell title="Health intake" user={session.user} section="client">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Latest intake</CardTitle>
          <CardDescription>
            Your most recent submission. Update on your next booking — health
            information is always re-confirmed at booking for safety.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!latest ? (
            <p className="text-sm text-muted-foreground">
              No intake submitted yet. You&apos;ll complete one when you book your first session.
            </p>
          ) : (
            <div className="space-y-5">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Field
                  label="Submitted"
                  value={format(latest.signedAt ?? latest.createdAt, "d MMM yyyy")}
                />
                <Field
                  label="Pregnancy"
                  value={
                    latest.pregnancy
                      ? latest.pregnancyWeeks
                        ? `Yes — ${latest.pregnancyWeeks} weeks`
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
                  {parseHistory(latest.medicalHistory).length === 0 ? (
                    <span className="text-sm text-muted-foreground">None</span>
                  ) : (
                    parseHistory(latest.medicalHistory).map((c) => (
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
                  value={latest.medicalConditions ?? "—"}
                  full
                />
                <Field label="Medications" value={latest.medications ?? "—"} />
                <Field label="Allergies" value={latest.allergies ?? "—"} />
                <Field label="Pain location" value={latest.painLocation ?? "—"} />
                <Field
                  label="Pain (0-10)"
                  value={latest.painScale != null ? String(latest.painScale) : "—"}
                />
                <Field label="Pain onset" value={latest.painOnset ?? "—"} />
                <Field
                  label="Pain history / previous treatment"
                  value={latest.painHistory ?? "—"}
                  full
                />
                <Field
                  label="Treatment goals"
                  value={latest.treatmentGoals ?? "—"}
                  full
                />
                <Field
                  label="Injuries / areas to avoid"
                  value={latest.injuries ?? "—"}
                  full
                />
                <Field
                  label="Emergency contact"
                  value={
                    [
                      latest.emergencyContactName,
                      latest.emergencyContactRelationship,
                      latest.emergencyContactPhone,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "—"
                  }
                  full
                />
              </dl>
            </div>
          )}
        </CardContent>
      </Card>

      <h2 className="font-semibold mb-2">History</h2>
      <div className="space-y-2">
        {intakes.length <= 1 ? (
          <p className="text-sm text-muted-foreground">No previous submissions.</p>
        ) : (
          intakes.slice(1).map((i) => (
            <Card key={i.id}>
              <CardContent className="py-3 text-sm flex justify-between">
                <span>{format(i.signedAt ?? i.createdAt, "d MMM yyyy, h:mm a")}</span>
                <span className="text-muted-foreground">{i.pregnancy ? "pregnancy: yes" : ""}</span>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </PortalShell>
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
