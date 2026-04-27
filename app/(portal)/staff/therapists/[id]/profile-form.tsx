"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const ASSOCIATIONS = ["AAMT", "MTAA", "ATMS", "MMA", "Other"];

export function ProfileForm({
  action,
  defaults,
}: {
  action: (
    formData: FormData,
  ) => Promise<{ ok?: boolean; error?: string }>;
  defaults: {
    id: string;
    bio: string;
    qualifications: string;
    providerNumber: string;
    associationName: string;
    active: boolean;
  };
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok?: boolean; error?: string } | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    fd.set("id", defaults.id);
    start(async () => {
      const res = await action(fd);
      setMsg(res);
    });
  }
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="providerNumber">Provider number</Label>
          <Input
            id="providerNumber"
            name="providerNumber"
            defaultValue={defaults.providerNumber}
            placeholder="e.g. AAMT-000123"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="associationName">Association</Label>
          <select
            id="associationName"
            name="associationName"
            defaultValue={defaults.associationName}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="">None</option>
            {ASSOCIATIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="qualifications">Qualifications</Label>
        <Input
          id="qualifications"
          name="qualifications"
          defaultValue={defaults.qualifications}
          placeholder="e.g. Diploma of Remedial Massage"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" name="bio" defaultValue={defaults.bio} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="active"
          defaultChecked={defaults.active}
        />
        Active (available for new bookings)
      </label>
      {msg?.error && <p className="text-sm text-destructive">{msg.error}</p>}
      {msg?.ok && <p className="text-sm text-emerald-600">Saved.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
