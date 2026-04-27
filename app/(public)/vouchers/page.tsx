import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { GiftIcon } from "lucide-react";
import { CLINIC } from "@/lib/clinic";
import { VoucherForm } from "./form";
import { purchaseVoucher } from "./actions";

export const metadata = { title: "Gift vouchers" };

export default function VouchersPage() {
  return (
    <div className="container py-12 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <GiftIcon className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-3xl font-bold">Gift vouchers</h1>
          <p className="text-muted-foreground">
            The perfect gift — redeemable at {CLINIC.name} on any treatment.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Purchase a voucher</CardTitle>
          <CardDescription>
            Choose an amount, enter the recipient&apos;s details, and we&apos;ll
            email them a redemption code. Vouchers are valid for 12 months from
            issue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VoucherForm action={purchaseVoucher} />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground mt-6">
        Vouchers are redeemed at booking confirmation by entering the code.
        Partial-balance vouchers can be reused until exhausted.
      </p>
    </div>
  );
}
