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
          <CardTitle>Reserve a voucher</CardTitle>
          <CardDescription>
            Choose an amount and the recipient&apos;s details. We&apos;ll
            email them a confirmation; the voucher activates once payment
            is confirmed in clinic. Vouchers are valid for 12 months from
            activation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VoucherForm action={purchaseVoucher} />
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground mt-6">
        Vouchers are single-use and applied in full at booking confirmation.
        Choose a treatment of equal or greater value to redeem.
      </p>
    </div>
  );
}
