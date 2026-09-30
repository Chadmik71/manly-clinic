"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestMagicLink } from "./magic-actions";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  // Only same-site paths: never redirect to another website after sign-in.
  const rawFrom = params.get("from") ?? "/portal";
  const from = rawFrom.startsWith("/") && !rawFrom.startsWith("//") ? rawFrom : "/portal";

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // "Email me a sign-in link" mode, for clients without (or who forgot) a password.
  const [linkMode, setLinkMode] = useState(false);
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null);

  async function onRequestLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const email = String(new FormData(e.currentTarget).get("email") ?? "").trim().toLowerCase();
    const res = await requestMagicLink(email, from);
    setLoading(false);
    if (res.error) setError(res.error);
    else setLinkSentTo(email);
  }

  if (linkMode) {
    return linkSentTo ? (
      <div className="space-y-3 text-sm">
        <p className="font-medium">Check your email</p>
        <p className="text-muted-foreground">
          If {linkSentTo} has an account with us, a sign-in link is on its way. It works
          once and expires in 20 minutes. Check your spam folder if it doesn&apos;t arrive.
        </p>
        <button type="button" className="text-primary hover:underline" onClick={() => { setLinkMode(false); setLinkSentTo(null); }}>
          Sign in with a password instead
        </button>
      </div>
    ) : (
      <form onSubmit={onRequestLink} method="post" className="space-y-4">
        <p className="text-sm text-muted-foreground">
          We&apos;ll email you a link that signs you in with one tap. No password needed.
        </p>
        <div className="space-y-2">
          <Label htmlFor="link-email">Email</Label>
          <Input id="link-email" name="email" type="email" required autoComplete="email" />
        </div>
        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sending…" : "Email me a sign-in link"}
        </Button>
        <button type="button" className="block mx-auto text-sm text-muted-foreground hover:text-foreground" onClick={() => { setLinkMode(false); setError(null); }}>
          Sign in with a password instead
        </button>
      </form>
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      email: String(fd.get("email") ?? "")
        .trim()
        .toLowerCase(),
      password: String(fd.get("password") ?? ""),
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("Invalid email or password.");
      return;
    }
    router.push(from);
    router.refresh();
  }

  return (
    // method="post": if someone submits before the page's JavaScript has
    // loaded, the browser falls back to a native submit. POST keeps the
    // password out of the URL, browser history and server logs.
    <form onSubmit={onSubmit} method="post" className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          <Link
            href="/forgot-password"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Forgot password?
          </Link>
        </div>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
      <Button type="button" variant="outline" className="w-full" onClick={() => { setLinkMode(true); setError(null); }}>
        No password? Email me a sign-in link
      </Button>
      <p className="text-sm text-center text-muted-foreground">
        No account?{" "}
        <Link href="/signup" className="text-primary hover:underline">
          Create one
        </Link>
      </p>
    </form>
  );
}
