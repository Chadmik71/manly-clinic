"use client";

import { useEffect, useState } from "react";
import { Share, Plus, Download, X, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

// Dismiss is remembered for this many days, then the hint may reappear once.
const DISMISS_DAYS = 14;
const DISMISS_KEY = "mrt_install_hint";
// Small delay so the hint doesn't slam in the instant the page paints.
const SHOW_DELAY_MS = 2500;

// Chrome/Android fire this before offering to install; we capture it so a
// single tap on our own button can trigger the native install prompt.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const when = Number(raw);
    if (!when) return false;
    return Date.now() - when < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS exposes navigator.standalone; everything else uses the display-mode MQ.
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
}

// iOS can only "Add to Home Screen" from Safari — not Chrome/Firefox on iOS,
// which are WebKit wrappers without the menu item. Detect Safari specifically.
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios|opt\//i.test(ua);
  return isIos && isSafari;
}

export function InstallAppHint() {
  const [mode, setMode] = useState<"android" | "ios" | null>(null);
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isStandalone() || recentlyDismissed()) return;

    let showTimer: ReturnType<typeof setTimeout> | undefined;

    // Android / desktop-Chrome path: wait for the browser's install signal.
    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // stop Chrome's mini-infobar; we drive it ourselves
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android");
      showTimer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    };

    // If the user installs via the browser UI, hide ourselves.
    const onInstalled = () => {
      setVisible(false);
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {}
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS Safari never fires beforeinstallprompt — show manual instructions.
    if (isIosSafari()) {
      setMode("ios");
      showTimer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (showTimer) clearTimeout(showTimer);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  }

  if (!visible || !mode) return null;

  return (
    <div
      role="dialog"
      aria-label="Add this site to your home screen"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-xl border border-border bg-card text-card-foreground shadow-lg sm:inset-x-0"
    >
      <div className="flex items-start gap-3 p-4">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Smartphone className="h-5 w-5" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Add our app to your phone</p>

          {mode === "android" ? (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Get one-tap booking from your home screen — opens like an app, no app store needed.
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">
              Tap the Share button{" "}
              <Share className="inline h-4 w-4 align-text-bottom" aria-label="Share" /> below, then{" "}
              <span className="whitespace-nowrap font-medium text-foreground">
                Add to Home Screen <Plus className="inline h-3.5 w-3.5 align-text-bottom" />
              </span>
              .
            </p>
          )}

          {mode === "android" && (
            <div className="mt-3 flex gap-2">
              <Button size="default" className="h-9 px-3" onClick={install}>
                <Download className="h-4 w-4" />
                Install
              </Button>
              <Button variant="ghost" className="h-9 px-3" onClick={dismiss}>
                Not now
              </Button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="-mr-1 -mt-1 shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
