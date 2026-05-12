"use client";

import { signOut } from "next-auth/react";

/**
 * Small inline "Not you?" link shown next to the signed-in user
 * name on /book/confirm. Clicking it signs the user out via NextAuth
 * and returns them to the same booking page so they can re-enter
 * as a different identity (either a different signed-in account or
 * as a guest with their own contact details).
 *
 * Purpose: a different person on the same device should not
 * accidentally complete a booking under a previously signed-in name.
 */
export function NotYouLink() {
  return (
    <button
      type="button"
      onClick={() => {
        const here =
          typeof window !== "undefined"
            ? window.location.pathname + window.location.search
            : "/book";
        signOut({ callbackUrl: here });
      }}
      className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
    >
      Not you?
    </button>
  );
}
