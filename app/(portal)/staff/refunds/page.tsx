import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatPrice } from "@/lib/utils";
import { DecideRefundButtons } from "./decide-buttons";
import { approveRefund, declineRefund } from "./actions";

export const metadata = { title: "Refund requests" };
export const dynamic = "force-dynamic";

const SYD_DATE_TIME = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const SYD_REQUESTED = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function statusVariant(
  status: string,
): "success" | "warning" | "destructive" | "secondary" {
  switch (status) {
    case "PROCESSED":
      return "success";
    case "REQUESTED":
    case "APPROVED":
      return "warning";
    case "DECLINED":
    case "FAILED":
      return "destructive";
    default:
      return "secondary";
  }
}

export default async function RefundsQueuePage() {
  const session = (await auth())!;
  if (session.user.role !== "ADMIN") redirect("/staff");

  const requests = await db.refundRequest.findMany({
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
    take: 100,
    include: {
      booking: {
        include: {
          service: { select: { name: true } },
          variant: { select: { durationMin: true } },
          client: { select: { name: true, email: true, phone: true } },
        },
      },
    },
  });

  const pending = requests.filter((r) => r.status === "REQUESTED");
  const decided = requests.filter((r) => r.status !== "REQUESTED");

  return (
    <StaffShell
      user={session.user}
      topbar={<span className="text-foreground font-medium">Refund requests</span>}
    >
      <div className="p-4 space-y-6 max-w-4xl">
        <header>
          <h1 className="text-lg font-semibold">Refund requests</h1>
          <p className="text-sm text-muted-foreground">
            Client-submitted requests to refund a deposit. Approve fires the
            Stripe refund and cancels the booking; decline notifies the client.
            Eligibility is re-checked at approval time.
          </p>
        </header>

        <section>
          <h2 className="text-sm font-semibold mb-2">
            Pending review{" "}
            <span className="text-muted-foreground font-normal">
              ({pending.length})
            </span>
          </h2>
          {pending.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No requests waiting.
            </p>
          ) : (
            <div className="space-y-3">
              {pending.map((r) => (
                <Card key={r.id}>
                  <CardContent className="py-4 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="warning">{r.status}</Badge>
                        <Link
                          href={`/staff/bookings/${r.booking.id}`}
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          {r.booking.reference}
                        </Link>
                        <span className="text-xs text-muted-foreground">
                          requested {SYD_REQUESTED.format(r.requestedAt)}
                        </span>
                      </div>
                      <div className="font-semibold mt-1">
                        {r.booking.client.name}{" "}
                        <span className="text-sm font-normal text-muted-foreground">
                          · {r.booking.client.email}
                          {r.booking.client.phone
                            ? ` · ${r.booking.client.phone}`
                            : ""}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {r.booking.service.name} ·{" "}
                        {r.booking.variant.durationMin} min ·{" "}
                        {SYD_DATE_TIME.format(r.booking.startsAt)}
                      </div>
                      <div className="text-sm mt-1">
                        Refund <strong>{formatPrice(r.amountCents)}</strong>
                      </div>
                      {r.reason && (
                        <div className="text-sm mt-2 rounded-md bg-muted/40 px-3 py-2 whitespace-pre-wrap">
                          <span className="text-xs uppercase tracking-wide text-muted-foreground block mb-1">
                            Client reason
                          </span>
                          {r.reason}
                        </div>
                      )}
                    </div>
                    <DecideRefundButtons
                      requestId={r.id}
                      amountLabel={formatPrice(r.amountCents)}
                      reference={r.booking.reference}
                      approveAction={approveRefund}
                      declineAction={declineRefund}
                    />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold mb-2">
            Recently decided{" "}
            <span className="text-muted-foreground font-normal">
              ({decided.length})
            </span>
          </h2>
          {decided.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No decisions yet.
            </p>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-muted-foreground bg-muted/40">
                      <tr className="text-left">
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Booking</th>
                        <th className="px-4 py-3">Client</th>
                        <th className="px-4 py-3">Amount</th>
                        <th className="px-4 py-3">Decided</th>
                        <th className="px-4 py-3">By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {decided.map((r) => (
                        <tr key={r.id} className="border-t align-top">
                          <td className="px-4 py-3">
                            <Badge variant={statusVariant(r.status)}>
                              {r.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/staff/bookings/${r.booking.id}`}
                              className="font-mono text-xs text-primary hover:underline"
                            >
                              {r.booking.reference}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {SYD_DATE_TIME.format(r.booking.startsAt)}
                            </div>
                          </td>
                          <td className="px-4 py-3">{r.booking.client.name}</td>
                          <td className="px-4 py-3">
                            {formatPrice(r.amountCents)}
                          </td>
                          <td className="px-4 py-3">
                            {r.decidedAt
                              ? SYD_REQUESTED.format(r.decidedAt)
                              : "—"}
                            {r.declineReason && (
                              <div className="text-xs text-muted-foreground mt-1 max-w-xs whitespace-pre-wrap">
                                {r.declineReason}
                              </div>
                            )}
                            {r.stripeError && (
                              <div className="text-xs text-destructive mt-1 max-w-xs">
                                {r.stripeError}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {r.decidedByName ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    </StaffShell>
  );
}
