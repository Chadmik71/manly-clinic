import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Phone, Mail, MapPin, Clock } from "lucide-react";
import { CLINIC } from "@/lib/clinic";
import { Blob, LeafSprig } from "@/components/decor";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <div className="relative overflow-hidden container py-12 md:py-16">
      <Blob className="pointer-events-none absolute -top-32 -right-40 h-[26rem] w-[26rem] text-accent/30 dark:text-accent/15" />
      <div className="relative flex items-center gap-2 mb-8">
        <LeafSprig className="h-7 w-7 text-primary/70" />
        <h1 className="text-4xl font-bold tracking-tight">Contact us</h1>
      </div>
      <div className="relative grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Get in touch</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3">
              <Phone className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <div className="font-medium">Phone</div>
                <a className="text-muted-foreground hover:text-foreground" href={`tel:${CLINIC.phoneE164}`}>
                  {CLINIC.phone}
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <div className="font-medium">Email</div>
                <a className="text-muted-foreground hover:text-foreground" href={`mailto:${CLINIC.email}`}>
                  {CLINIC.email}
                </a>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <div className="font-medium">Clinic</div>
                <p className="text-muted-foreground">
                  {CLINIC.address.line1}<br />
                  {CLINIC.address.suburb} {CLINIC.address.state} {CLINIC.address.postcode}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <div className="font-medium">Hours</div>
                <p className="text-muted-foreground">{CLINIC.hours}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Privacy enquiries</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              For requests to access or correct your personal or health
              information, or to lodge a privacy complaint, please email our
              privacy contact:
            </p>
            <p className="font-medium text-foreground">{CLINIC.privacyOfficerEmail}</p>
            <p>
              We respond to privacy requests within 30 days as required under
              the Australian Privacy Principles.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
