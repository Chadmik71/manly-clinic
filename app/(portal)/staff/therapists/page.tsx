import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { therapistInternalName } from "@/lib/utils";
import Link from "next/link";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AddTherapistDialog } from "./add-therapist-dialog";
import { SeedPlaceholderButton } from "./seed-button";
import { seedPlaceholderTherapists } from "./actions";

export const metadata = { title: "Therapists" };
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function formatMin(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mm.toString().padStart(2, "0")} ${ampm}`;
}

export default async function TherapistsPage() {
  const session = (await auth())!;
  const therapists = await db.therapist.findMany({
    include: { user: true, availability: { orderBy: { dayOfWeek: "asc" } } },
    orderBy: { user: { name: "asc" } },
  });

  // Placeholder bootstrap UI: only show the seed button when no
  // "Therapist N" (N=2..10) records exist yet. After admin clicks once,
  // these will all exist and the button auto-hides.
  const placeholderLabels = ["Therapist 2", "Therapist 3", "Therapist 4", "Therapist 5", "Therapist 6", "Therapist 7", "Therapist 8", "Therapist 9", "Therapist 10"];
  const hasPlaceholders = therapists.some((t) => t.displayName && placeholderLabels.includes(t.displayName));

  return (
    <StaffShell user={session.user} topbar={<span className="text-foreground font-medium">Therapists</span>}>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-muted-foreground">Click a therapist to edit their profile, hours, and time off.</p>
          <div className="flex items-center gap-2 flex-wrap">
            {!hasPlaceholders && (
              <SeedPlaceholderButton action={seedPlaceholderTherapists} />
            )}
            <AddTherapistDialog />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {therapists.map((t) => (
            <Card key={t.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Link href={`/staff/therapists/${t.id}`} className="hover:underline">{therapistInternalName(t)}</Link>
                  <Badge variant={t.active ? "success" : "secondary"}>{t.active ? "active" : "inactive"}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <div className="text-muted-foreground">{t.user.email}</div>
                {t.providerNumber && <div className="text-xs">Provider <span className="font-mono">{t.providerNumber}</span>{t.associationName ? ` · ${t.associationName}` : ""}</div>}
                {t.qualifications && <div className="text-xs">{t.qualifications}</div>}
                {t.bio && <p className="text-sm">{t.bio}</p>}
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Weekly hours</div>
                  <ul className="space-y-0.5">
                    {dayNames.map((d, i) => {
                      const slot = t.availability.find((a) => a.dayOfWeek === i);
                      return (
                        <li key={i} className="flex justify-between">
                          <span>{d}</span>
                          <span className="text-muted-foreground">{slot ? `${formatMin(slot.startMin)} – ${formatMin(slot.endMin)}` : "Off"}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="pt-2">
                  <Button asChild size="sm" variant="outline"><Link href={`/staff/therapists/${t.id}`}>Edit</Link></Button>
                </div>
              </CardContent>
            </Card>
          ))}
          {therapists.length === 0 && (
            <Card><CardContent className="py-6 text-sm text-muted-foreground text-center">No therapists yet. Click Add Therapist to get started.</CardContent></Card>
          )}
        </div>
      </div>
    </StaffShell>
  );
}
