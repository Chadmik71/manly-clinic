import Link from "next/link";
import { CLINIC } from "@/lib/clinic";

export function SiteFooter() {
  return (
    <footer className="border-t bg-muted/30 mt-16">
      <div className="container py-10 grid gap-8 md:grid-cols-4 text-sm">
        <div>
          <div className="font-semibold mb-2">{CLINIC.name}</div>
          <p className="text-muted-foreground">
            {CLINIC.address.line1}<br />
            {CLINIC.address.suburb} {CLINIC.address.state} {CLINIC.address.postcode}
          </p>
        </div>
        <div>
          <div className="font-semibold mb-2">Contact</div>
          <ul className="space-y-1 text-muted-foreground">
            <li><a href={`tel:${CLINIC.phoneE164}`} className="hover:text-foreground">{CLINIC.phone}</a></li>
            <li><a href={`mailto:${CLINIC.email}`} className="hover:text-foreground">{CLINIC.email}</a></li>
            <li>{CLINIC.hours}</li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-2">Clinic</div>
          <ul className="space-y-1 text-muted-foreground">
            <li><Link href="/services" className="hover:text-foreground">Services</Link></li>
            <li><Link href="/about" className="hover:text-foreground">About</Link></li>
            <li><Link href="/book" className="hover:text-foreground">Book online</Link></li>
            <li><Link href="/vouchers" className="hover:text-foreground">Gift vouchers</Link></li>
            <li><Link href="/portal" className="hover:text-foreground">Client portal</Link></li>
          </ul>
        </div>
        <div>
          <div className="font-semibold mb-2">Legal</div>
          <ul className="space-y-1 text-muted-foreground">
            <li><Link href="/privacy" className="hover:text-foreground">Privacy policy</Link></li>
            <li><Link href="/terms" className="hover:text-foreground">Terms</Link></li>
            <li><Link href="/privacy#data-request" className="hover:text-foreground">Data access / deletion</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <div className="container py-4 text-xs text-muted-foreground flex flex-col sm:flex-row gap-2 justify-between">
          <span>© {new Date().getFullYear()} {CLINIC.name}. All rights reserved.</span>
          <span>Health information handled in accordance with the Privacy Act 1988 (Cth).</span>
        </div>
      </div>
    </footer>
  );
}
