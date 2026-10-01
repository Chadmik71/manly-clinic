import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { PortalShell } from "@/components/portal-shell";
import { FileText, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CLINIC } from "@/lib/clinic";
import { consentLabel } from "@/lib/consent-label";

export const metadata = { title: "Data & privacy" };

// Sydney time, not the server's (Vercel runs in UTC).
const SYD = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const SYD_DATE = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default async function DataPage() {
  const session = (await auth())!;
  const consents = await db.consentRecord.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const latest = (type: string) => consents.find((c) => c.type === type && c.granted);
  const treat = latest("TREATMENT");
  const store = latest("HEALTH_INFO_STORAGE");
  const mail = (subject: string) => `mailto:${CLINIC.privacyOfficerEmail}?subject=${encodeURIComponent(subject)}`;

  return (
    <PortalShell title="Data &amp; privacy" user={session.user} section="client">
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Your information</CardTitle>
          <CardDescription>
            Your details and health information are private. You can see everything we hold about you,
            and ask us to correct or delete it at any time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/portal/data/summary">
                <FileText className="h-4 w-4" /> See all my information
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href={mail("Please correct my information")}>
                <Pencil className="h-4 w-4" /> Ask for a correction
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={mail("Please delete my information")}>
                <Trash2 className="h-4 w-4" /> Ask for deletion
              </a>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            By law we keep treatment and health records for 7 years after your last visit. Anything else
            can be deleted when you ask. Questions? Email {CLINIC.privacyOfficerEmail} or call {CLINIC.phone}.
          </p>
          <p className="text-xs">
            <a href="/api/portal/export" className="text-muted-foreground underline">
              Download as a data file (for software)
            </a>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>What you agreed to</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {consents.length === 0 ? (
            <p className="text-muted-foreground">No records yet.</p>
          ) : (
            <>
              {(treat || store) && (
                <p>
                  ✓ You agreed to {[treat && "treatment", store && "us storing your health information"].filter(Boolean).join(" and ")}
                  {" "}(latest {SYD_DATE.format((treat ?? store)!.createdAt)}).
                </p>
              )}
              <details>
                <summary className="cursor-pointer text-muted-foreground">Show full history</summary>
                <ul className="mt-2 space-y-1">
                  {consents.map((c) => (
                    <li key={c.id}>
                      {SYD.format(c.createdAt)}: {consentLabel(c.type)} ({c.granted ? "agreed" : "not agreed"})
                    </li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </CardContent>
      </Card>
    </PortalShell>
  );
}
