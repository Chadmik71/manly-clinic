import Image from "next/image";
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
import { Blob } from "@/components/decor";

export const metadata = {
  title: "Gift vouchers",
  description:
    "Buy a gift voucher for Manly Remedial Thai — redeemable on any massage treatment in Manly. Valid 12 months from activation.",
};

export default function VouchersPage() {
  return (
    <div className="relative overflow-hidden container py-12 max-w-3xl">
      <Blob className="pointer-events-none absolute -top-28 -right-32 h-80 w-80 text-accent/30 dark:text-accent/15" />
      <div className="relative flex items-center gap-3 mb-6">
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

      {/* Spa/wellness flatlay (Pexels — free commercial license, no
          attribution required) to warm up the gift-voucher page. */}
      <div className="relative mb-6 h-44 w-full overflow-hidden rounded-2xl border sm:h-52">
        <Image
          src="/voucher-gift.jpg"
          alt="Natural spa products — the feel of a wellness gift"
          fill
          sizes="(max-width: 768px) 100vw, 768px"
          className="object-cover"
        />
      </div>

      <Card className="relative">
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

      <p className="relative text-sm text-muted-foreground mt-6">
        Vouchers are single-use and applied in full at booking confirmation.
        Choose a treatment of equal or greater value to redeem.
      </p>
    </div>
  );
}
