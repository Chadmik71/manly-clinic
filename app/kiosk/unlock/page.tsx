import Link from "next/link";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { KIOSK_COOKIE } from "@/lib/kiosk";
import { UnlockForm } from "./unlock-form";

export const metadata = { title: "Unlock tablet", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Staff-only: take the shop tablet out of client mode (lib/kiosk.ts). */
export default async function UnlockPage() {
  const session = await auth();
  const token = (await cookies()).get(KIOSK_COOKIE)?.value;
  const isStaff = session?.user && (session.user.role === "STAFF" || session.user.role === "ADMIN");

  return (
    <div className="min-h-screen bg-background grid place-items-center px-4">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 space-y-4">
        <h1 className="text-lg font-semibold">Unlock tablet (staff)</h1>
        {!token ? (
          <p className="text-sm">
            This device isn&apos;t in client mode.{" "}
            <Link href="/staff/schedule" className="text-primary underline">
              Go to the calendar
            </Link>
          </p>
        ) : isStaff ? (
          <UnlockForm staffName={session!.user!.name ?? "staff"} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No staff member is signed in on this device, so it can&apos;t be unlocked here.
          </p>
        )}
        {token && (
          <Link href={`/kiosk/${token}`} className="block text-center text-sm text-muted-foreground hover:text-foreground">
            ← Back to the client&apos;s form
          </Link>
        )}
      </div>
    </div>
  );
}
