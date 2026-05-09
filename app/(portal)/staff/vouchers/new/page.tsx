import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { StaffShell } from "@/components/staff-shell";
import { WalkinForm } from "./walkin-form";

export const dynamic = "force-dynamic";

export default async function NewVoucherPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/staff/vouchers/new");
  if (session.user.role !== "STAFF" && session.user.role !== "ADMIN") {
    redirect("/portal");
  }

  return (
    <StaffShell user={session.user}>
      <div className="p-4 sm:p-6 max-w-xl">
        <div className="mb-4">
          <div className="text-xs text-muted-foreground mb-1">
            <Link href="/staff/vouchers" className="hover:underline">
              ← Vouchers
            </Link>
          </div>
          <h1 className="text-2xl font-bold">Create voucher</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Walk-in customer paying in person — voucher is created as ACTIVE and immediately redeemable.
          </p>
        </div>
        <WalkinForm />
      </div>
    </StaffShell>
  );
}
