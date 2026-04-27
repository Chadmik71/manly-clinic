"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const AMOUNTS = [50, 100, 150, 200, 300];

export function VoucherForm({
  action,
}: {
  action: (
    formData: FormData,
  ) => Promise<{ ok?: boolean; error?: string; code?: string }>;
}) {
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState<number>(100);
  const [custom, setCustom] = useState<string>("");
  const [result, setResult] = useState<{ ok?: boolean; error?: string; code?: string } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setResult(null);
    const fd = new FormData(e.currentTarget);
    const finalAmount = custom ? parseFloat(custom) : amount;
    if (!Number.isFinite(finalAmount) || finalAmount < 20) {
      setResult({ error: "Minimum voucher amount is $20." });
      return;
    }
    fd.set("amountCents", String(Math.round(finalAmount * 100)));
    start(async () => {
      const res = await action(fd);
      setResult(res);
      if (res.ok) (e.target as HTMLFormElement).reset();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Amount</Label>
        <div className="flex flex-wrap gap-2">
          {AMOUNTS.map((a) => (
            <button
              type="button"
              key={a}
              onClick={() => {
                setAmount(a);
                setCustom("");
              }}
              className={`px-3 py-1.5 rounded-md border text-sm ${
                !custom && amount === a
                  ? "border-primary bg-primary/5 text-primary"
                  : "hover:bg-accent"
              }`}
            >
              ${a}
            </button>
          ))}
          <Input
            type="number"
            inputMode="decimal"
            min={20}
            placeholder="Custom $"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="max-w-[140px]"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="recipientName">Recipient name</Label>
          <Input id="recipientName" name="recipientName" required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recipientEmail">Recipient email</Label>
          <Input
            id="recipientEmail"
            name="recipientEmail"
            type="email"
            required
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="message">Message (optional)</Label>
        <Textarea id="message" name="message" placeholder="Happy birthday!" />
      </div>
      <p className="text-xs text-muted-foreground">
        Online payment is not yet enabled — your voucher will be emailed and
        marked active immediately, with payment to be confirmed in clinic
        within 7 days.
      </p>
      {result?.error && (
        <p className="text-sm text-destructive">{result.error}</p>
      )}
      {result?.ok && result.code && (
        <p className="text-sm text-emerald-600">
          Voucher created — code <span className="font-mono">{result.code}</span> emailed to recipient.
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Purchase voucher"}
      </Button>
    </form>
  );
}
