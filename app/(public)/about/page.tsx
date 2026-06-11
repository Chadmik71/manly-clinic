import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck, GraduationCap, HeartPulse, Lock } from "lucide-react";
import { CLINIC } from "@/lib/clinic";
import { Blob, LeafSprig } from "@/components/decor";

export const metadata = {
  title: "About the clinic",
  description:
    "Manly Remedial Thai is a clinical remedial massage practice in Manly on Sydney's Northern Beaches — qualified therapists, assessment-led treatment, and health records protected under the Australian Privacy Act.",
};

export default function AboutPage() {
  return (
    <div className="relative overflow-hidden container py-12 md:py-16">
      <Blob className="pointer-events-none absolute -top-32 -right-40 h-[26rem] w-[26rem] text-accent/30 dark:text-accent/15" />
      <div className="relative grid items-center gap-8 md:grid-cols-2">
        <div className="max-w-prose">
          <div className="flex items-center gap-2 mb-4">
            <LeafSprig className="h-7 w-7 text-primary/70" />
            <h1 className="text-4xl font-bold tracking-tight">
              About {CLINIC.name}
            </h1>
          </div>
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
        {/* Calming treatment-room photo (Pexels — free commercial license, no
            attribution required). Portrait crop sits beside the intro on
            desktop and stacks below it on mobile. */}
        <div className="relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-2xl border shadow-sm">
          <Image
            src="/about-clinic.jpg"
            alt="Remedial massage therapist treating a client in a calm clinic room"
            fill
            sizes="(max-width: 768px) 100vw, 384px"
            className="object-cover"
          />
        </div>
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
