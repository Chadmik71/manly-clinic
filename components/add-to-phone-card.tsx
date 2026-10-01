"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Download, Plus, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

/**
 * "Add us to your phone" card shown inside a page (booking confirmed, account
 * overview). Android/Chrome: one-tap install. iPhone Safari: the two steps.
 * Other browsers: a link to /app with the steps. Hidden when already opened
 * from the home screen. See components/install-app-hint.tsx for the pop-up.
 */
export function AddToPhoneCard({ className }: { className?: string }) {
  const [mode, setMode] = useState<"android" | "ios-safari" | "ios-other" | "other" | "installed" | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return setMode("installed");
    const ua = navigator.userAgent;
    const ios = /iphone|ipad|ipod/i.test(ua);
    const safari = /safari/i.test(ua) && !/crios|fxios|edgios|opt\//i.test(ua);
    setMode(ios ? (safari ? "ios-safari" : "ios-other") : "other");
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    const onInstalled = () => setMode("installed");
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!mode || mode === "installed") return null;

  return (
    <div className={`rounded-xl border bg-card p-4 ${className ?? ""}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <p className="font-semibold">Add us to your phone for next time</p>
          <p className="text-muted-foreground">Book again in one tap from your home screen. No app store needed.</p>
          {mode === "android" && (
            <Button
              className="mt-3 h-9"
              onClick={async () => {
                if (!deferred) return;
                await deferred.prompt();
                await deferred.userChoice;
                setDeferred(null);
              }}
            >
              <Download className="h-4 w-4" /> Add to home screen
            </Button>
          )}
          {mode === "ios-safari" && (
            <p className="mt-2">
              Tap <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> <b>Share</b> below, then{" "}
              <b className="whitespace-nowrap">
                Add to Home Screen <Plus className="inline h-3.5 w-3.5 align-text-bottom" />
              </b>
              .
            </p>
          )}
          {mode === "ios-other" && (
            <p className="mt-2">
              Open this page in <b>Safari</b>, then tap <b>Share</b> → <b>Add to Home Screen</b>.
            </p>
          )}
          {mode === "other" && (
            <p className="mt-2">
              <Link href="/app" className="text-primary underline">
                How to add it (iPhone and Android)
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
