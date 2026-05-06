"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Edit per-booking internal/admin notes (Booking.notes). Free-text staff-only
 * field, distinct from per-visit clinical SOAP notes.
 */
export function EditInternalNotesForm({
  bookingId,
  currentNotes,
  action,
}: {
  bookingId: string;
  currentNotes: string;
  action: (
    bookingId: string,
    notes: string,
  ) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [notes, setNotes] = useState(currentNotes);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    startTransition(async () => {
      const res = await action(bookingId, notes);
      setMsg(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="ein-notes" className="sr-only">
          Notes
        </Label>
        <Textarea
          id="ein-notes"
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Free-text staff notes about this booking. Not visible to the client."
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save notes"}
        </Button>
        {msg?.ok && (
          <span className="text-xs text-muted-foreground">Saved.</span>
        )}
        {msg?.error && (
          <span className="text-sm text-destructive">{msg.error}</span>
        )}
      </div>
    </form>
  );
}
