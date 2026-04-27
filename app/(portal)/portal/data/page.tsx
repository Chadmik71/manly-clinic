import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PortalShell } from "@/components/portal-shell";
import { Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CLINIC } from "@/lib/clinic";
import { format } from "date-fns";

export const metadata = { title: "Data & privacy" };

export default async function DataPage() {
  const session = (await auth())!;
  const consents = await db.consentRecord.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <PortalShell title="Data &amp; privacy" user={session.user} section="client">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Your rights</CardTitle>
          <CardDescription>
            Under the Australian Privacy Principles you can access, correct, or
            request deletion of your information at any time.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href="/api/portal/export"><Download className="h-4 w-4" /> Download my data (JSON)</a>
          </Button>
          <Button asChild variant="outline">
            <a href={`mailto:${CLINIC.privacyOfficerEmail}?subject=Deletion%20request`}>
              Request deletion
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={`mailto:${CLINIC.privacyOfficerEmail}?subject=Correction%20request`}>
              Request correction
            </a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Consent history</CardTitle>
          <CardDescription>
            Every consent you grant is timestamped and stored as proof of
            informed consent.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {consents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No consent records yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr className="text-left">
                  <th className="py-2">Date</th>
                  <th>Type</th>
                  <th>Version</th>
                  <th>Granted</th>
                </tr>
              </thead>
              <tbody>
                {consents.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="py-2">{format(c.createdAt, "d MMM yyyy, h:mm a")}</td>
                    <td>{c.type.replace(/_/g, " ").toLowerCase()}</td>
                    <td>{c.version}</td>
                    <td>{c.granted ? "Yes" : "No"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </PortalShell>
  );
}
