"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // Clients booked in by staff (or imported) already have an account without
  // a password; point them at "set your password" instead of a dead end.
  const [accountExists, setAccountExists] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setAccountExists(false);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const password = String(fd.get("password") ?? "");
    const confirmPassword = String(fd.get("confirmPassword") ?? "");

    if (password !== confirmPassword) {
      setLoading(false);
      setError("Passwords don't match. Please re-type and try again.");
      return;
    }

    const payload = {
      name: String(fd.get("name") ?? "").trim(),
      email: String(fd.get("email") ?? "").trim().toLowerCase(),
      phone: String(fd.get("phone") ?? "").trim(),
      password,
      consentPrivacy: fd.get("consentPrivacy") === "on",
    };

    if (!payload.consentPrivacy) {
      setLoading(false);
      setError("You must accept the privacy policy to create an account.");
      return;
    }

    const res = await fetch("/api/signup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      if (res.status === 409) {
        setAccountExists(true);
        setLoading(false);
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Could not create account.");
      setLoading(false);
      return;
    }

    await signIn("credentials", {
      email: payload.email,
      password: payload.password,
      redirect: false,
    });

    router.push("/portal");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} method="post" className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Full name</Label>
        <Input id="name" name="name" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" name="phone" type="tel" autoComplete="tel" placeholder="0400 000 000" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
        />
        <p className="text-xs text-muted-foreground">Minimum 8 characters.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          minLength={8}
          required
          autoComplete="new-password"
        />
      </div>
      <label className="flex items-start gap-2 text-sm text-muted-foreground">
        <input type="checkbox" name="consentPrivacy" className="mt-1" required />
        <span>
          I have read and accept the{" "}
          <Link href="/privacy" className="text-primary hover:underline" target="_blank">
            privacy policy
          </Link>{" "}
          and consent to the storage of my personal information.
        </span>
      </label>
      {error && (
        <p className="text-sm text-destructive" role="alert">{error}</p>
      )}
      {accountExists && (
        <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm" role="alert">
          <p className="font-medium">You already have an account with us.</p>
          <p className="text-muted-foreground mt-1">
            If we booked you in over the phone or at the clinic, your account was set up
            for you. Choose a password to start using it.
          </p>
          <Link href="/forgot-password" className="inline-block mt-2 text-primary font-medium hover:underline">
            Set your password →
          </Link>
        </div>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Creating…" : "Create account"}
      </Button>
      <p className="text-sm text-center text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-primary hover:underline">Sign in</Link>
      </p>
    </form>
  );
}
