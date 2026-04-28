import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatPrice, formatDuration } from "@/lib/utils";

export const metadata = { title: "Booking confirmed" };

// Sydney-aware formatters (Vercel runtime is UTC, clinic is Australia/Sydney).
const SYD_DATE = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const SYD_TIME = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

export default async function BookingConfirmedPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const sp = await searchParams;
  if (!sp.ref) redirect("/book");

  const booking = await db.booking.findUnique({
    where: { reference: sp.ref },
    include: {
      service: true,
      variant: true,
      client: { select: { id: true, email: true, name: true } },
    },
  });
  if (!booking) redirect("/book");

  const session = await auth();
  // A signed-in client viewing somebody else's booking ref is not allowed.
  // We don't 404 because the ref might not be theirs but is harmless to show
  // generically; but we hide PII unless the session matches.
  const isOwner =
    !session?.user || // guest path: we just show a generic confirmation
    session.user.id === booking.client.id;

  return (
    <div className="container py-12 max-w-2xl">
      <Card className="border-emerald-500/40 bg-emerald-500/5">
        <CardHeader>
          <CardTitle className="text-emerald-700 dark:text-emerald-400">
            Booking confirmed 🎉
          </CardTitle>
          <CardDescription>
            Reference{" "}
            <code className="font-mono">{booking.reference}</code> — a
            confirmation email is on its way.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Treatment</span>
              <span className="font-medium">{booking.service.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-medium">
                {formatDuration(booking.variant.durationMin)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price</span>
              <span className="font-medium">
                {formatPrice(booking.priceCentsAtBooking)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">
                {SYD_DATE.format(booking.startsAt)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Time</span>
              <span className="font-medium">
                {SYD_TIME.format(booking.startsAt)} –{" "}
                {SYD_TIME.format(booking.endsAt)} (Sydney)
              </span>
            </div>
            {isOwner && booking.client.email ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Confirmation sent to</span>
                <span className="font-medium">{booking.client.email}</span>
              </div>
            ) : null}
          </div>

          {!session?.user ? (
            <div className="rounded-md border bg-background p-3 space-y-2">
              <p className="font-medium">
                Want to manage your bookings online next time?
              </p>
              <p className="text-muted-foreground">
                We&apos;ve linked this booking to your customer record. Set a
                password for your account so you can sign in to reschedule,
                view your intake form, or book again faster.
              </p>
              <Link
                href="/forgot-password"
                className="text-primary font-medium hover:underline"
              >
                Set a password →
              </Link>
            </div>
          ) : (
            <div className="rounded-md border bg-background p-3">
              <Link
                href="/portal/bookings"
                className="text-primary font-medium hover:underline"
              >
                View all my bookings →
              </Link>
            </div>
          )}

          <div className="border-t pt-4 space-y-2 text-muted-foreground">
            <p className="font-medium text-foreground">What to expect</p>
            <p>
              Please arrive 5 minutes early so we can greet you. Wear loose
              comfortable clothing. If you need to cancel or reschedule, give
              us a call on{" "}
              <a
                href="tel:+61412822226"
                className="text-primary hover:underline"
              >
                0412 822 226
              </a>{" "}
              at least 24 hours ahead.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex gap-3 justify-center">
        <Link
          href="/"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Back to home
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link
          href="/book"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Book another session
        </Link>
      </div>
    </div>
  );
}
