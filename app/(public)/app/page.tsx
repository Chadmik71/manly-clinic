import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CLINIC } from "@/lib/clinic";
import { AddToPhoneCard } from "@/components/add-to-phone-card";

export const metadata = {
  title: "Add us to your phone",
  description: `Put ${CLINIC.name} on your phone's home screen and book in one tap. No app store needed.`,
};

/** How to add the web app to a phone (linked from emails and the QR card). */
export default function AddToPhonePage() {
  return (
    <div className="container max-w-2xl py-10 md:py-14 space-y-8">
      <div className="flex items-center gap-4">
        <Image src="/icon-192.png" alt="" width={72} height={72} className="rounded-2xl shadow" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Add us to your phone</h1>
          <p className="text-muted-foreground">
            Our booking app on your home screen. Opens in one tap, no app store, nothing to pay.
          </p>
        </div>
      </div>

      <AddToPhoneCard />

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-3">iPhone</h2>
          <ol className="list-decimal pl-5 space-y-2 text-sm">
            <li>Open this page in <b>Safari</b></li>
            <li>Tap the <b>Share</b> button (the square with an arrow)</li>
            <li>Scroll down and tap <b>Add to Home Screen</b></li>
            <li>Tap <b>Add</b></li>
          </ol>
        </div>
        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-semibold mb-3">Android</h2>
          <ol className="list-decimal pl-5 space-y-2 text-sm">
            <li>Open this page in <b>Chrome</b></li>
            <li>Tap the <b>⋮</b> menu (top right)</li>
            <li>Tap <b>Install app</b> or <b>Add to Home screen</b></li>
            <li>Tap <b>Install</b> / <b>Add</b></li>
          </ol>
        </div>
      </section>

      <p className="text-sm text-muted-foreground">
        Look for the {CLINIC.name} icon on your home screen. Tap it any time to book, see your bookings or update your
        health form.
      </p>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/book">Book now</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/portal">My account</Link>
        </Button>
      </div>
    </div>
  );
}
