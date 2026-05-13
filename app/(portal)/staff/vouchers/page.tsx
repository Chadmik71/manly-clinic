import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import { format } from "date-fns";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Vouchers" };

// PENDING_PAYMENT vouchers need staff action (activate after in-clinic
// payment). Surface them first so they're not buried under historical rows.
const STATUS_PRIORITY: Record<string, number> = {
  PENDING_PAYMENT: 0,
  ACTIVE: 1,
  REDEEMED: 2,
  EXPIRED: 3,
  CANCELLED: 4,
};

export default async function VouchersListPage() {
  const session = (await auth())!;
  const vouchersRaw = await db.voucher.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const vouchers = [...vouchersRaw].sort((a, b) => {
    const pa = STATUS_PRIORITY[a.status] ?? 9;
    const pb = STATUS_PRIORITY[b.status] ?? 9;
    if (pa !== pb) return pa - pb;
    // Same status: keep newest first (the original ordering).
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return (
    <StaffShell
      user={session.user}
      topbar={<span className="text-foreground font-medium">Vouchers</span>}
    >
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h1 className="text-2xl font-bold">Vouchers</h1>
          <Button asChild>
            <Link href="/staff/vouchers/new">+ New voucher</Link>
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
                  <tr className="text-left">
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Balance</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v) => (
                    <tr key={v.id} className="border-t">
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link
                          href={`/staff/vouchers/${v.id}`}
                          className="text-primary hover:underline"
                        >
                          {v.code}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div>{v.recipientName}</div>
                        <div className="text-xs text-muted-foreground">{v.recipientEmail}</div>
                      </td>
                      <td className="px-4 py-3">{formatPrice(v.amountCents)}</td>
                      <td className="px-4 py-3">{formatPrice(v.balanceCents)}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={
                            v.status === "ACTIVE"
                              ? "success"
                              : v.status === "PENDING_PAYMENT"
                                ? "warning"
                                : v.status === "REDEEMED"
                                  ? "secondary"
                                  : "destructive"
                          }
                        >
                          {v.status === "PENDING_PAYMENT"
                            ? "PENDING PAYMENT"
                            : v.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">{format(v.createdAt, "d MMM yyyy")}</td>
                      <td className="px-4 py-3">
                        {v.expiresAt
                          ? format(v.expiresAt, "d MMM yyyy")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                  {vouchers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                        No vouchers yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </StaffShell>
  );
}
