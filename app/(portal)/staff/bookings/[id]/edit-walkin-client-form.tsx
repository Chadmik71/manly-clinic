"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Edit walk-in client name and phone. Email is intentionally omitted because
 * it’s the User’s @unique identifier on the schema; changing it could collide
 * with another walk-in record. Renders only when booking.isWalkIn === true.
 */
export function EditWalkInClientForm({
  bookingId,
  currentName,
  currentPhone,
  action,
}: {
  bookingId: string;
  currentName: string;
  currentPhone: string;
  action: (
    bookingId: string,
    data: { name: string; phone: string },
  ) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(currentName);
  const [phone, setPhone] = useState(currentPhone);

  function reset() {
    setName(currentName);
    setPhone(currentPhone);
    setError(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await action(bookingId, { name, phone });
      if (res.error) {
        setError(res.error);
      } else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Edit walk-in details
      </Button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="ewc-name">Name</Label>
        <Input
          id="ewc-name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ewc-phone">Phone</Label>
        <Input
          id="ewc-phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="e.g. 0412 345 678"
        />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
