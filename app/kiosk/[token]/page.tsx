import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/db";
import { CLINIC } from "@/lib/clinic";
import { verifyKioskToken } from "@/lib/kiosk";
import { bookingsNeedingHealthForm, getIntakePrefill } from "@/lib/booking-intake";
import { sydneyDateLong, sydneyTimeShort } from "@/lib/time";
import { KioskDone, KioskForm } from "./kiosk-form";
import { isPlaceholderEmail } from "@/lib/placeholder-email";

function accountOffer(c: { role: string; email: string }) {
  if (c.role !== "CLIENT") return null;
  return isPlaceholderEmail(c.email)
    ? { needsEmail: true, maskedEmail: null }
    : { needsEmail: false, maskedEmail: maskEmail(c.email) };
}

function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  return `${user.slice(0, 1)}${"*".repeat(Math.max(2, user.length - 1))}@${domain}`;
}

export const metadata = { title: "Health form", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The shop-tablet page handed to a client (lib/kiosk.ts): only this one
 * booking's health form. No menus or links except the small staff unlock.
 */
export default async function KioskPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = verifyKioskToken(token);
  const b = t
    ? await db.booking.findUnique({
        where: { id: t.bookingId },
        include: { service: true, variant: true, client: { select: { name: true, email: true, role: true } } },
      })
    : null;

  let body: React.ReactNode;
  if (!t || !b) {
    body = <Message title="Please hand the tablet back to staff" text="This form link isn't valid." />;
  } else if (b.status !== "PENDING" && b.status !== "CONFIRMED") {
    body = <Message title="Please hand the tablet back to staff" text="This booking is no longer upcoming." />;
  } else if (!(await bookingsNeedingHealthForm([b])).has(b.id)) {
    // Form saved: same hand-back screen as right after saving, with the
    // optional account link while the link is still valid.
    body = <KioskDone token={token} account={t.expired ? null : accountOffer(b.client)} />;
  } else if (t.expired) {
    body = <Message title="This form has timed out" text="Please hand the tablet back to staff so they can open it again." />;
  } else {
    const prefill = await getIntakePrefill(b.clientId);
    const parts = b.client.name.trim().split(/\s+/);
    const displayName = parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
    body = (
      <>
        <p className="text-sm text-muted-foreground mb-4">
          {b.variant.durationMin} min {b.service.name} · {sydneyDateLong(b.startsAt)} at {sydneyTimeShort(b.startsAt)}
        </p>
        <KioskForm
          token={token}
          bookingId={b.id}
          displayName={displayName}
          healthFundEligible={b.service.healthFundEligible}
          isPregnancyService={b.service.slug === "pregnancy-massage"}
          prefill={prefill}
          account={accountOffer(b.client)}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Image src="/logo-icon.png" alt="" width={48} height={48} className="rounded-md" />
          <div>
            <div className="font-semibold">{CLINIC.name}</div>
            <div className="text-sm text-muted-foreground">Health form</div>
          </div>
        </div>
        <div className="rounded-lg border bg-card p-5">{body}</div>
        <div className="mt-10 text-center">
          <Link href="/kiosk/unlock" className="text-xs text-muted-foreground/60 hover:text-muted-foreground">
            Staff: unlock tablet
          </Link>
        </div>
      </div>
    </div>
  );
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="text-center py-10 space-y-3">
      <p className="text-2xl font-semibold">{title}</p>
      <p className="text-muted-foreground">{text}</p>
    </div>
  );
}
