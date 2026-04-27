import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, GraduationCap, HeartPulse, Lock } from "lucide-react";
import { CLINIC } from "@/lib/clinic";

export const metadata = { title: "About the clinic" };

export default function AboutPage() {
  return (
    <div className="container py-12 md:py-16">
      <div className="max-w-3xl">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          About {CLINIC.name}
        </h1>
        <p className="text-lg text-muted-foreground mb-6">
          A clinical remedial therapy practice in {CLINIC.address.suburb}.
          Our therapists combine assessment-led treatment plans with the relief
          of soft-tissue work — for chronic pain, sports injury, posture
          rehabilitation, and pregnancy wellbeing.
        </p>
        <p className="text-muted-foreground">
          We treat your information the same way a medical practice would.
          Health intake forms are stored encrypted, accessed only by your
          treating therapist, and disclosed only with your written consent —
          consistent with the Australian Privacy Principles under the Privacy
          Act 1988 (Cth).
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-12">
        {[
          {
            icon: GraduationCap,
            title: "Qualified therapists",
            body: "Diploma of Remedial Massage and association memberships (e.g. AAMT, MTAA).",
          },
          {
            icon: HeartPulse,
            title: "Clinical approach",
            body: "Subjective assessment, objective measures, treatment plan, re-assessment.",
          },
          {
            icon: Lock,
            title: "Records protected",
            body: "Encrypted at rest, hosted in Australia, audit-logged on access.",
          },
          {
            icon: ShieldCheck,
            title: "Your data, your control",
            body: "Request access, correction, or deletion of your records at any time.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <Card key={title}>
            <CardContent className="pt-6">
              <Icon className="h-6 w-6 text-primary mb-3" />
              <div className="font-semibold mb-1">{title}</div>
              <p className="text-sm text-muted-foreground">{body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
