"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addTherapist } from "./actions";

export function AddTherapistDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isCasual, setIsCasual] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const fd = new FormData(e.currentTarget);
      // Ensure the checkbox value reaches the server even when the browser
      // would otherwise omit it (unchecked checkboxes are skipped).
      if (isCasual) fd.set("isCasual", "on");
      else fd.delete("isCasual");
      await addTherapist(fd);
      setOpen(false);
      setIsCasual(false);
      formRef.current?.reset();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  if (!open)
    return <Button onClick={() => setOpen(true)}>+ Add Therapist</Button>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md mx-4 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold">Add New Therapist</h2>
        <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
          <label className="flex items-start gap-2 rounded-md border bg-accent/30 p-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              name="isCasual"
              checked={isCasual}
              onChange={(e) => setIsCasual(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">
                Casual staff &mdash; no login needed
              </span>
              <br />
              <span className="text-muted-foreground text-xs">
                Tick this for therapists who only come in for special days.
                Only the name is required, no email or password, and no
                default availability is set &mdash; you&apos;ll add the
                specific day(s) they work afterwards.
              </span>
            </span>
          </label>

          <div>
            <Label>Full Name *</Label>
            <Input name="name" required placeholder="e.g. Sarah Smith" />
          </div>

          {!isCasual && (
            <>
              <div>
                <Label>Email *</Label>
                <Input
                  name="email"
                  type="email"
                  required
                  placeholder="therapist@example.com"
                />
              </div>
              <div>
                <Label>Password * (they can change later)</Label>
                <Input name="password" type="password" required minLength={6} />
              </div>
            </>
          )}

          <div>
            <Label>Phone</Label>
            <Input name="phone" placeholder="04xx xxx xxx" />
          </div>
          <div>
            <Label>Qualifications</Label>
            <Input
              name="qualifications"
              placeholder="Diploma of Remedial Massage"
            />
          </div>
          <div>
            <Label>Provider Number</Label>
            <Input name="providerNumber" placeholder="AAMT-000123" />
          </div>
          <div>
            <Label>Association</Label>
            <Input name="associationName" placeholder="AAMT" />
          </div>
          <div>
            <Label>Bio</Label>
            <Input name="bio" placeholder="Brief description..." />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add Therapist"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setOpen(false);
                setError("");
                setIsCasual(false);
              }}
            >
              Cancel
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            {isCasual
              ? "No availability set. Add specific working days from the therapist's detail page after creating."
              : "Default hours set to Mon-Sat 9am-8:30pm. Edit after adding."}
          </p>
        </form>
      </div>
    </div>
  );
}
