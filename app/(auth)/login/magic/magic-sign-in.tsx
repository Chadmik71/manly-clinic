"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

/**
 * Signs in with the emailed token only when the person presses the button:
 * email link scanners open links automatically, and signing in on page load
 * would let them use up the single-use link.
 */
export function MagicSignIn() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const rawNext = params.get("next") ?? "/portal";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/portal";
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function go() {
    setPending(true);
    setFailed(false);
    const res = await signIn("magic-link", { token, redirect: false });
    if (res?.error || !res?.ok) {
      setPending(false);
      setFailed(true);
      return;
    }
    router.push(next);
    router.refresh();
  }

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        This sign-in link is incomplete.{" "}
        <Link href="/login" className="text-primary hover:underline">Request a new one</Link>.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Button type="button" className="w-full" onClick={go} disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
      {failed && (
        <p className="text-sm text-destructive" role="alert">
          This link has expired or has already been used.{" "}
          <Link href={`/login?from=${encodeURIComponent(next)}`} className="underline">
            Request a new one
          </Link>
          .
        </p>
      )}
    </div>
  );
}
