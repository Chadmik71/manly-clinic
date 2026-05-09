"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { createWalkinVoucher } from "../actions";

const TIERS = [
  { price: 70, label: "30min" },
  { price: 95, label: "45min" },
  { price: 120, label: "60min" },
  { price: 155, label: "75min" },
  { price: 170, label: "90min" },
  { price: 230, label: "120min" },
] as const;

export function WalkinForm() {
  const [tier, setTier] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");

  const amountCents = customAmount.trim()
    ? Math.round(Number(customAmount) * 100)
    : tier !== null
      ? tier * 100
      : 0;
  const validAmount = amountCents >= 500 && amountCents <= 100000;

  return (
    <Card>
      <CardContent className="p-6">
        <form action={createWalkinVoucher} className="space-y-5">
          <input type="hidden" name="amountCents" value={amountCents || ""} />

          <div>
            <Label className="mb-2 block">Amount</Label>
            <div className="grid grid-cols-3 gap-2">
              {TIERS.map((t) => {
                const selected = tier === t.price && !customAmount.trim();
                return (
                  <button
                    key={t.price}
                    type="button"
                    onClick={() => {
                      setTier(t.price);
                      setCustomAmount("");
                    }}
                    className={`h-14 rounded-md border text-sm font-medium transition-colors flex flex-col items-center justify-center ${
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-input bg-background hover:bg-accent"
                    }`}
                  >
                    <span className="block text-base font-semibold">${t.price}</span>
                    <span className="block text-[10px] text-muted-foreground mt-0.5">{t.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Label htmlFor="custom" className="text-sm whitespace-nowrap">
                Or custom $
              </Label>
              <Input
                id="custom"
                type="number"
                inputMode="numeric"
                min={5}
                step={5}
                value={customAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value);
                  setTier(null);
                }}
                className="max-w-[140px]"
                placeholder="e.g. 75"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Selected: <strong>${(amountCents / 100).toFixed(2)}</strong>
            </p>
          </div>

          <div>
            <Label htmlFor="recipientName">Recipient name</Label>
            <Input
              id="recipientName"
              name="recipientName"
              required
              maxLength={100}
              placeholder="e.g. Sarah Smith"
            />
          </div>

          <div>
            <Label htmlFor="recipientEmail">Recipient email</Label>
            <Input
              id="recipientEmail"
              name="recipientEmail"
              type="email"
              required
              placeholder="friend@example.com"
            />
            <p className="text-xs text-muted-foreground mt-1">
              You can email the code to the recipient from the next page, or just print it and hand it over.
            </p>
          </div>

          <div>
            <Label htmlFor="message">
              Personal message <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="message"
              name="message"
              maxLength={500}
              rows={3}
              placeholder="e.g. Happy birthday!"
            />
          </div>

          <Button type="submit" disabled={!validAmount} className="w-full">
            Create voucher
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Voucher is created as ACTIVE (immediately redeemable). Make sure the customer has paid before clicking Create.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
