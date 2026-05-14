"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Drop-in component that triggers a soft refresh of the current route on a
 * fixed interval. Uses router.refresh() which re-runs the server component
 * tree without unmounting client state — open modals, in-flight form input,
 * etc. survive each tick.
 *
 * Pauses while the tab is backgrounded (document.hidden) so we don't burn
 * DB queries on a staff member's parked Chrome tab.
 */
export function AutoRefresh({ intervalMs = 30000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
