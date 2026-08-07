"use client";

import { useState } from "react";
import { joinWaitlist } from "./waitlist-actions";

export function WaitlistForm({
  serviceId,
  date,
  prefill,
}: {
  serviceId: string;
  date: string;
  prefill?: { name?: string | null; email?: string | null };
}) {
  const [name, setName] = useState(prefill?.name ?? "");
  const [email, setEmail] = useState(prefill?.email ?? "");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<
    null | { kind: "ok" } | { kind: "error"; message: string }
  >(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setResult(null);
    const fd = new FormData();
    fd.set("serviceId", serviceId);
    fd.set("date", date);
    fd.set("name", name);
    fd.set("email", email);
    fd.set("phone", phone);
    if (consent) fd.set("consent", "on");
    const r = await joinWaitlist(fd);
    setResult(r.ok ? { kind: "ok" } : { kind: "error", message: r.error });
    setPending(false);
  }

  if (result?.kind === "ok") {
    return (
      <p className="text-sm text-green-600 text-center">
        You&apos;re on the list — we&apos;ll text you if a spot opens up.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-2 text-left">
      <p className="text-xs text-muted-foreground text-center">
        Notify me if a spot opens up on this day
      </p>
      <input
        type="text"
        placeholder="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
        disabled={pending}
        className="w-full rounded border px-2 py-1.5 text-sm"
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        disabled={pending}
        className="w-full rounded border px-2 py-1.5 text-sm"
      />
      <input
        type="tel"
        placeholder="Mobile, e.g. 0433 273 377"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        required
        disabled={pending}
        className="w-full rounded border px-2 py-1.5 text-sm"
      />
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          disabled={pending}
          className="mt-0.5"
          required
        />
        <span>
          Text/email me if a spot opens up for this treatment on this day. Not
          guaranteed — it&apos;s first come, first served.
        </span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {pending ? "Joining..." : "Notify me"}
      </button>
      {result?.kind === "error" ? (
        <p className="text-xs text-red-600 text-center">{result.message}</p>
      ) : null}
    </form>
  );
}
