"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, UserX, ExternalLink, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { sydneyTimeShort, SYDNEY_TZ } from "@/lib/time";
import { setBookingStatus } from "@/app/(portal)/staff/bookings/[id]/actions";
import { getBookingSummary, type BookingSummary } from "./actions";

/** What the calendar card already knows, so the pop-up opens instantly. */
export type BookingPreview = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  priceCents: number;
  serviceName: string;
  durationMin: number;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  therapistName: string;
  needsIntakeForm: boolean;
  healthChanges: string[];
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No-show",
};

const STATUS_CLASS: Record<string, string> = {
  CONFIRMED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  COMPLETED: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  CANCELLED: "bg-muted text-muted-foreground",
  NO_SHOW: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const dateFmt = new Intl.DateTimeFormat("en-AU", {
  timeZone: SYDNEY_TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});

/**
 * Pop-up shown when staff click a booking on the calendar. Opens with the
 * card's own data, then loads the rest (payment, notes, visit history)
 * through getBookingSummary. Health information stays on the full page.
 */
export function BookingDetailsDialog({
  preview,
  onClose,
}: {
  preview: BookingPreview;
  onClose: () => void;
}) {
  const router = useRouter();
  const [details, setDetails] = useState<BookingSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    let live = true;
    getBookingSummary(preview.id)
      .then((res) => {
        if (!live) return;
        if (res.ok) setDetails(res.booking);
        else setLoadError(res.error);
      })
      .catch(() => live && setLoadError("Couldn't load the booking details."));
    return () => {
      live = false;
    };
  }, [preview.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const status = details?.status ?? preview.status;
  const canComplete = status !== "COMPLETED" && status !== "CANCELLED";
  const canNoShow = status !== "NO_SHOW" && status !== "CANCELLED";

  function setStatus(next: string) {
    setActionError(null);
    start(async () => {
      const res = await setBookingStatus(preview.id, next);
      if (res.error) {
        setActionError(res.error);
      } else {
        router.refresh();
        onClose();
      }
    });
  }

  const dateLabel = dateFmt.format(preview.startsAt);
  const timeLabel = `${sydneyTimeShort(preview.startsAt)} – ${sydneyTimeShort(preview.endsAt)}`;
  const balanceCents = details
    ? Math.max(0, details.priceCents - details.paidCents - details.voucherAppliedCents)
    : null;
  const priceLabel = formatPrice(preview.priceCents);
  const paidLabel = details ? formatPrice(details.paidCents) : "";
  const voucherLabel = details ? formatPrice(details.voucherAppliedCents) : "";
  const balanceLabel = balanceCents != null ? formatPrice(balanceCents) : "";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-dialog-title"
      onClick={onClose}
    >
      <div
        className="bg-background w-full sm:max-w-md rounded-t-lg sm:rounded-lg p-5 shadow-xl border max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 id="booking-dialog-title" className="text-lg font-semibold leading-tight">
              {timeLabel}
            </h2>
            <div className="text-sm text-muted-foreground">
              {dateLabel} · {preview.therapistName}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[status] ?? "bg-muted"}`}
          >
            {STATUS_LABEL[status] ?? status}
          </span>
          {details?.claimWithHealthFund && (
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-teal-500/15 text-teal-700 dark:text-teal-300">
              Health fund claim
            </span>
          )}
          {details?.isCouple && (
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-violet-500/15 text-violet-700 dark:text-violet-300">
              Couple booking
            </span>
          )}
          {details?.isWalkIn && (
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold bg-muted">Walk-in</span>
          )}
          {details && (
            <span className="text-xs text-muted-foreground ml-auto font-mono">{details.reference}</span>
          )}
        </div>

        {preview.needsIntakeForm && (
          <div className="mb-4 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
            <div className="font-semibold text-amber-800 dark:text-amber-300">Medical form needed</div>
            <div className="text-muted-foreground">
              Fill it in with the client when they arrive: open the full booking and use
              &ldquo;Complete medical form&rdquo;. They sign on the screen.
            </div>
          </div>
        )}

        {preview.healthChanges.length > 0 && (
          <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm">
            <div className="font-semibold text-red-800 dark:text-red-300">
              Health update since last visit
            </div>
            <div className="text-muted-foreground">
              Changed: {preview.healthChanges.join(", ")}. Check the details on the full
              booking page before the session.
            </div>
          </div>
        )}

        <dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Client</dt>
          <dd className="font-medium min-w-0">{preview.clientName}</dd>

          <dt className="text-muted-foreground">Phone</dt>
          <dd className="min-w-0">{preview.clientPhone ?? "—"}</dd>

          {details?.client.email && (
            <>
              <dt className="text-muted-foreground">Email</dt>
              <dd className="min-w-0 break-all">{details.client.email}</dd>
            </>
          )}

          {details && (
            <>
              <dt className="text-muted-foreground">History</dt>
              <dd className="min-w-0">
                {details.client.visitCount} visit{details.client.visitCount === 1 ? "" : "s"}
                {details.client.noShowCount > 0 && (
                  <span className="text-red-600 dark:text-red-400">
                    {" "}· {details.client.noShowCount} no-show{details.client.noShowCount === 1 ? "" : "s"}
                  </span>
                )}
              </dd>
            </>
          )}

          <dt className="text-muted-foreground">Service</dt>
          <dd className="min-w-0">
            {preview.durationMin} min {preview.serviceName}
          </dd>

          <dt className="text-muted-foreground">Price</dt>
          <dd className="tabular-nums">{priceLabel}</dd>

          {details && details.paidCents > 0 && (
            <>
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="tabular-nums">{paidLabel}</dd>
            </>
          )}
          {details && details.voucherAppliedCents > 0 && (
            <>
              <dt className="text-muted-foreground">Voucher</dt>
              <dd className="tabular-nums">{voucherLabel}</dd>
            </>
          )}
          {details && (details.paidCents > 0 || details.voucherAppliedCents > 0) && (
            <>
              <dt className="text-muted-foreground">To pay</dt>
              <dd className="tabular-nums font-semibold">{balanceLabel}</dd>
            </>
          )}

          {details?.notes && (
            <>
              <dt className="text-muted-foreground">Notes</dt>
              <dd className="min-w-0 whitespace-pre-wrap">{details.notes}</dd>
            </>
          )}
          {details?.cancelReason && (
            <>
              <dt className="text-muted-foreground">Cancelled</dt>
              <dd className="min-w-0">{details.cancelReason}</dd>
            </>
          )}
        </dl>

        {!details && !loadError && (
          <p className="text-xs text-muted-foreground mt-3">Loading details…</p>
        )}
        {loadError && <p className="text-sm text-red-600 mt-3">{loadError}</p>}
        {actionError && <p className="text-sm text-red-600 mt-3">{actionError}</p>}

        <div className="flex flex-wrap gap-2 mt-5">
          {canComplete && (
            <Button size="sm" onClick={() => setStatus("COMPLETED")} disabled={pending}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Mark completed
            </Button>
          )}
          {canNoShow && (
            <Button size="sm" variant="outline" onClick={() => setStatus("NO_SHOW")} disabled={pending}>
              <UserX className="h-4 w-4 mr-1" />
              No-show
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link href={`/staff/clients/${preview.clientId}`} target="_blank" rel="noopener">
              <User className="h-4 w-4 mr-1" />
              Client record
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/staff/bookings/${preview.id}`} target="_blank" rel="noopener">
              <ExternalLink className="h-4 w-4 mr-1" />
              Open full booking
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
