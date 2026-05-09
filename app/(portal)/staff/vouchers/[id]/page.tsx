import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import { format } from "date-fns";
import { PrintButton } from "./print-button";
import { emailWalkinVoucher, redeemVoucher } from "../actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ new?: string; emailed?: string; redeemed?: string }>;

export default async function VoucherDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "STAFF" && session.user.role !== "ADMIN") {
    redirect("/portal");
  }

  const { id } = await params;
  const { new: isNew, emailed: emailedFlag, redeemed: redeemedFlag } = await searchParams;

  const voucher = await db.voucher.findUnique({ where: { id } });
  if (!voucher) notFound();

  const justCreated = isNew === "1";
  const justEmailed = emailedFlag === "1";
  const justRedeemed = redeemedFlag === "1";
  const expiresAtLabel = voucher.expiresAt
    ? format(voucher.expiresAt, "d MMM yyyy")
    : "No expiry";
  const createdAtLabel = format(voucher.createdAt, "d MMM yyyy 'at' h:mma");

  return (
    <StaffShell user={session.user}>
      <div className="p-4 sm:p-6 max-w-2xl">
        {/* Header — hidden when printing */}
        <div className="mb-4 print:hidden">
          {justCreated && (
            <div className="mb-3 rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm">
              ✓ Voucher created. Hand the printed copy to the customer, or share the code below.
            </div>
          )}
          {justEmailed && (
            <div className="mb-3 rounded-md border border-blue-500/30 bg-blue-500/10 p-3 text-sm">
              ✉ Email sent to {voucher.recipientName} ({voucher.recipientEmail}).
            </div>
          )}
        {justRedeemed && (
          <div className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            ✓ Voucher redeemed — {formatPrice(voucher.amountCents)} applied.
          </div>
        )}
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                <Link href="/staff/vouchers" className="hover:underline">
                  ← Vouchers
                </Link>
              </div>
              <h1 className="text-2xl font-bold break-all">{voucher.code}</h1>
              <p className="text-sm text-muted-foreground">Created {createdAtLabel}</p>
            </div>
            <Badge variant={voucher.status === "ACTIVE" ? "default" : "secondary"}>
              {voucher.status}
            </Badge>
          </div>
        </div>

        {/* Printable voucher card */}
        <Card className="print:shadow-none print:border-0">
          <CardContent className="p-8 space-y-6 print:p-12">
            <div className="text-center space-y-1">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Manly Remedial &amp; Thai Massage
              </p>
              <h2 className="text-2xl font-bold">Gift Voucher</h2>
            </div>

            <div className="text-center py-4 border-y">
              <p className="text-sm text-muted-foreground mb-1">Value</p>
              <p className="text-4xl font-bold">
                {formatPrice(voucher.balanceCents)}
                {voucher.balanceCents !== voucher.amountCents && (
                  <span className="block text-sm font-normal text-muted-foreground mt-1">
                    of {formatPrice(voucher.amountCents)} original
                  </span>
                )}
              </p>
            </div>

            <div className="text-center py-2">
              <p className="text-sm text-muted-foreground mb-2">Voucher code</p>
              <p className="text-3xl font-mono font-bold tracking-widest break-all">
                {voucher.code}
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">For</p>
                <p className="font-medium">{voucher.recipientName}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Valid until</p>
                <p className="font-medium">{expiresAtLabel}</p>
              </div>
            </div>

            {voucher.message && (
              <div className="border-t pt-4 text-sm">
                <p className="text-muted-foreground mb-1">Message</p>
                <p className="italic">&ldquo;{voucher.message}&rdquo;</p>
              </div>
            )}

            <div className="text-xs text-muted-foreground border-t pt-4 text-center space-y-1">
              <p>Present this voucher (or the code above) at the time of booking.</p>
              <p>Single use; non-refundable; non-transferable.</p>
            </div>
          </CardContent>
        </Card>

        {voucher.status === "ACTIVE" && (
          <Card className="mt-4 print:hidden">
            <CardContent className="p-6 space-y-4">
              <div>
                <h3 className="font-semibold">Redeem voucher</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Apply when customer uses this voucher today. Voucher value:{" "}
                  <strong>{formatPrice(voucher.amountCents)}</strong> — single use, fully applied.
                </p>
              </div>
              <form action={redeemVoucher} className="space-y-3">
                <input type="hidden" name="voucherId" value={voucher.id} />
                <div className="flex gap-2 items-end flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <Label htmlFor="redeemNote">Service / note (optional)</Label>
                    <Input
                      id="redeemNote"
                      name="note"
                      maxLength={200}
                      placeholder="e.g. 60min remedial massage"
                    />
                  </div>
                  <Button type="submit">Apply</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Action buttons — hidden when printing */}
        <div className="mt-4 flex gap-2 print:hidden flex-wrap">
          <PrintButton />
          <form action={emailWalkinVoucher}>
            <input type="hidden" name="voucherId" value={voucher.id} />
            <Button type="submit" variant="outline">
              Email to recipient
            </Button>
          </form>
          <Button asChild variant="outline">
            <Link href="/staff/vouchers">Back to vouchers</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/staff/vouchers/new">Create another</Link>
          </Button>
        </div>
      </div>
    </StaffShell>
  );
}
