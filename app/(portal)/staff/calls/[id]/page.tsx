import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { sydneyDateLong, sydneyTimeShort } from "@/lib/time";
import { callLength, callOutcome, readableTranscript } from "@/lib/phone-agent/transcript";
import { OutcomeBadge } from "../outcome-badge";

export const metadata = { title: "Phone call" };
export const dynamic = "force-dynamic";

const SPEAKER = { caller: "Caller", assistant: "Assistant", action: "" } as const;

export default async function CallPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect(`/login?from=/staff/calls/${id}`);
  if (session.user.role !== "STAFF" && session.user.role !== "ADMIN") redirect("/staff");

  const call = await db.phoneCall.findUnique({ where: { id } });
  if (!call) notFound();
  await audit({ userId: session.user.id, action: "VIEW_PHONE_CALL", resource: `PhoneCall:${id}` });

  const refs = call.bookingRefs?.split(",").filter(Boolean) ?? [];
  const bookings = refs.length
    ? await db.booking.findMany({
        where: { reference: { in: refs } },
        select: { id: true, reference: true, client: { select: { name: true } } },
      })
    : [];
  const lines = readableTranscript(call.transcript);
  const length = callLength(call);

  return (
    <StaffShell
      user={session.user}
      topbar={
        <Link href="/staff/calls" className="text-muted-foreground hover:text-foreground">
          ← Phone calls
        </Link>
      }
    >
      <div className="p-4 space-y-4 max-w-3xl">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold">Call from {call.fromPhone ?? "a hidden number"}</h1>
          <p className="text-sm text-muted-foreground">
            {sydneyDateLong(call.createdAt)} at {sydneyTimeShort(call.createdAt)}
            {length && ` · ${length}`}
          </p>
          <OutcomeBadge outcome={callOutcome(call)} />
        </header>

        {bookings.length > 0 && (
          <Card>
            <CardContent className="p-4 space-y-1 text-sm">
              <div className="font-medium">Bookings made on this call</div>
              {bookings.map((b) => (
                <div key={b.id}>
                  <Link href={`/staff/bookings/${b.id}`} className="underline">
                    {b.reference}
                  </Link>{" "}
                  for {b.client.name}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-4 space-y-3 text-sm">
            {lines.map((l, i) =>
              l.kind === "action" ? (
                <div key={i} className="text-xs text-muted-foreground border-l-2 pl-3 italic">
                  {l.text}
                </div>
              ) : (
                <div key={i} className={cn("flex flex-col", l.kind === "caller" && "items-end")}>
                  <span className="text-xs text-muted-foreground mb-0.5">{SPEAKER[l.kind]}</span>
                  <div
                    className={cn(
                      "rounded-lg px-3 py-2 max-w-[85%]",
                      l.kind === "caller" ? "bg-primary/10" : "bg-muted",
                    )}
                  >
                    {l.text}
                  </div>
                </div>
              ),
            )}
            {lines.length === 1 && (
              <p className="text-muted-foreground">The caller didn&apos;t say anything after the greeting.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </StaffShell>
  );
}
