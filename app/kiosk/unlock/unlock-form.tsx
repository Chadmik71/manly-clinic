"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { unlockTablet } from "./actions";

export function UnlockForm({ staffName }: { staffName: string }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await unlockTablet(password);
          if (res.error || !res.url) {
            setPassword("");
            return setError(res.error ?? "Couldn't unlock.");
          }
          window.location.href = res.url;
        });
      }}
    >
      <p className="text-sm text-muted-foreground">
        Signed in as <b className="text-foreground">{staffName}</b>. Enter your password to leave client mode.
      </p>
      <input
        type="password"
        aria-label="Staff password"
        autoComplete="current-password"
        className="w-full rounded-md border bg-background px-3 py-2"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={pending || !password} className="w-full">
        {pending ? "Unlocking…" : "Unlock tablet"}
      </Button>
    </form>
  );
}
