"use client";
import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TimeOffForm({
  addAction,
  therapistId,
}: {
  addAction: (
    formData: FormData,
  ) => Promise<{ ok?: boolean; error?: string }>;
  therapistId: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);
  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    fd.set("therapistId", therapistId);
    start(async () => {
      const res = await addAction(fd);
      setMsg(res);
      if (res.ok) {
        (e.target as HTMLFormElement).reset();
      }
    });
  }
  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr_auto] items-end"
    >
      <div className="space-y-1.5">
        <Label htmlFor="startsAt" className="text-xs">From</Label>
        <Input id="startsAt" name="startsAt" type="datetime-local" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="endsAt" className="text-xs">To</Label>
        <Input id="endsAt" name="endsAt" type="datetime-local" required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="reason" className="text-xs">Reason (optional)</Label>
        <Input id="reason" name="reason" placeholder="e.g. Annual leave" />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Adding…" : "Add"}
      </Button>
      {msg?.error && (
        <p className="sm:col-span-4 text-sm text-destructive">{msg.error}</p>
      )}
    </form>
  );
}
