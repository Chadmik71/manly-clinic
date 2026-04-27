import { CLINIC } from "@/lib/clinic";

export const metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <div className="container py-12 md:py-16 max-w-3xl">
      <h1 className="text-4xl font-bold tracking-tight mb-6">
        Terms of service
      </h1>
      <div className="space-y-4 text-muted-foreground">
        <p>
          By booking with {CLINIC.name} you agree to provide accurate
          information on your intake form and to disclose any health condition
          or medication that may affect treatment.
        </p>
        <p>
          <strong className="text-foreground">Cancellations.</strong>{" "}
          Cancellations within 24 hours of your appointment may incur a 50%
          fee. No-shows may incur full session fee.
        </p>
        <p>
          <strong className="text-foreground">Public holidays.</strong> A 10%
          surcharge applies to all services on NSW public holidays.
        </p>
        <p>
          <strong className="text-foreground">Health funds.</strong> Rebates
          are subject to your individual fund and policy. We recommend you
          confirm cover with your fund prior to your appointment.
        </p>
      </div>
    </div>
  );
}
