"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setClientPreferences } from "@/app/(portal)/staff/clients/account-actions";

/**
 * Short treatment-preferences note on the client page ("firm pressure, avoid
 * left shoulder"). Shown on this client's booking cards on the calendar.
 */
export function ClientPreferences({ clientId, initial }: { clientId: string; initial: string | null }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial ?? "");
  const [saved, setSaved] = useState(initial ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    start(async () => {
      const res = await setClientPreferences(clientId, value);
      if (res.error) setError(res.error);
      else {
        setSaved(value.trim());
        setEditing(false);
      }
    });
  }

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-muted-foreground text-xs uppercase tracking-wide">Preferences</div>
        {!editing && (
          <button type="button" className="text-xs text-primary hover:underline" onClick={() => setEditing(true)}>
            {saved ? "Edit" : "Add"}
          </button>
        )}
      </div>
      {editing ? (
        <div className="mt-1 space-y-2">
          <textarea
            aria-label="Treatment preferences"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            rows={2}
            maxLength={300}
            placeholder="e.g. firm pressure, avoid left shoulder, likes Palm"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">Shown on this client&rsquo;s booking cards.</p>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={save} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setValue(saved);
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm whitespace-pre-wrap">{saved || <span className="text-muted-foreground">None yet.</span>}</p>
      )}
    </div>
  );
}
