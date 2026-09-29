"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendPortalInvite, setClientEmail } from "@/app/(portal)/staff/clients/account-actions";

/**
 * Staff-side "Online account" controls for one client: add their real email
 * (when the record only has a placeholder) and send an invite to set a
 * password for the portal. Used on the client record and booking pages.
 */
export function ClientAccountSection({
  clientId,
  email,
  hasRealEmail,
}: {
  clientId: string;
  email: string;
  hasRealEmail: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function saveEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDone(null);
    start(async () => {
      const res = await setClientEmail(clientId, value);
      if (res.error) setError(res.error);
      else {
        setDone("Email saved. You can now send the invite.");
        setValue("");
        router.refresh();
      }
    });
  }

  function invite() {
    setError(null);
    setDone(null);
    start(async () => {
      const res = await sendPortalInvite(clientId);
      if (res.error) setError(res.error);
      else setDone(`Invite sent to ${res.sentTo}. The link works once, for 72 hours.`);
    });
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="font-medium">Online account</div>
      {hasRealEmail ? (
        <>
          <p className="text-muted-foreground break-all">
            Email on file: <span className="text-foreground">{email}</span>
          </p>
          <Button type="button" size="sm" variant="outline" onClick={invite} disabled={pending}>
            <Send className="h-4 w-4 mr-1" />
            {pending ? "Sending…" : "Send online account invite"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Emails the client a link to choose a password, so they can book online with
            their health form already filled in.
          </p>
        </>
      ) : (
        <form onSubmit={saveEmail} className="space-y-2">
          <p className="text-muted-foreground">
            No email on file yet. Ask the client for it while they&rsquo;re here, then send
            them an invite to set up their online account.
          </p>
          <Label htmlFor={`client-email-${clientId}`} className="sr-only">
            Client email
          </Label>
          <div className="flex flex-wrap gap-2">
            <Input
              id={`client-email-${clientId}`}
              type="email"
              inputMode="email"
              autoComplete="off"
              placeholder="client@example.com"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="min-w-0 flex-1 basis-48"
              required
            />
            <Button type="submit" size="sm" disabled={pending}>
              <Mail className="h-4 w-4 mr-1" />
              {pending ? "Saving…" : "Save email"}
            </Button>
          </div>
        </form>
      )}
      {error && <p className="text-destructive">{error}</p>}
      {done && <p className="text-emerald-700 dark:text-emerald-400">{done}</p>}
    </div>
  );
}
