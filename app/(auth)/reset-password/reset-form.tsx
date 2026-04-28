"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetPasswordForm({
  action,
  token,
}: {
  action: (
    fd: FormData,
  ) => Promise<{ ok?: boolean; error?: string; email?: string }>;
  token: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    const confirm = String(fd.get("confirm") ?? "");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match — please re-enter.");
      return;
    }
    fd.set("token", token);
    start(async () => {
      const res = await action(fd);
      if (res?.error || !res?.ok || !res?.email) {
        setError(res?.error ?? "Something went wrong. Please try again.");
        return;
      }
      // Auto-sign-in with the freshly-set password.
      const signRes = await signIn("credentials", {
        email: res.email,
        password,
        redirect: false,
      });
      if (signRes?.error) {
        // Reset succeeded but auto-login failed; send them to /login.
        router.push("/login");
        return;
      }
      router.push("/portal");
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          At least 8 characters.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
        />
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Setting password…" : "Set new password"}
      </Button>
    </form>
  );
}
