"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, User, Phone, MessageSquare, DoorOpen, Repeat, Wallet, XCircle } from "lucide-react";
import { CHECKOUT_LABEL, CHECKOUT_METHODS, type CheckoutMethod } from "@/lib/checkout";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils";
import { sydneyTimeShort, SYDNEY_TZ } from "@/lib/time";
import { setBookingStatus } from "@/app/(portal)/staff/bookings/[id]/actions";
import { getBookingSummary, recordCheckout, setBookingArrived, type BookingSummary } from "./actions";
import type { QuickBookInitial } from "./quick-book-dialog";

const sydDate = new Intl.DateTimeFormat("en-CA", { timeZone: SYDNEY_TZ });
type CancelKind = "CANT_MAKE_IT" | "NO_SHOW" | "CLINIC" | "REJECTED" | "OTHER";
const CANCEL_KINDS: { key: CancelKind; label: string; status: "CANCELLED" | "NO_SHOW"; notify: boolean }[] = [
  { key: "CANT_MAKE_IT", label: "Client can't make it", status: "CANCELLED", notify: true },
  { key: "NO_SHOW", label: "Didn't turn up (no-show)", status: "NO_SHOW", notify: false },
  { key: "CLINIC", label: "Clinic cancelled (e.g. staff sick)", status: "CANCELLED", notify: true },
  { key: "REJECTED", label: "Rejected / refused", status: "CANCELLED", notify: false },
  { key: "OTHER", label: "Other", status: "CANCELLED", notify: true },
];

const confirmedWhen = new Intl.DateTimeFormat("en-AU", {
  timeZone: SYDNEY_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const sydTime = new Intl.DateTimeFormat("en-GB", { timeZone: SYDNEY_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

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
  onBookAgain,
}: {
  preview: BookingPreview;
  onClose: () => void;
  /** Opens the quick-booking panel pre-filled for the same time next week. */
  onBookAgain?: (initial: QuickBookInitial) => void;
}) {
  const router = useRouter();
  const [details, setDetails] = useState<BookingSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [cancelNotify, setCancelNotify] = useState(true);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelKind, setCancelKind] = useState<CancelKind | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [payOpen, setPayOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<CheckoutMethod | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payAndComplete, setPayAndComplete] = useState(true);

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
  }, [preview.id, reloadKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const status = details?.status ?? preview.status;
  const canComplete = status !== "COMPLETED" && status !== "CANCELLED";
  // One "Cancel booking" button covers no-shows too; the reason decides the
  // status. A booking already marked no-show can still be switched to a
  // proper cancellation.
  const canCancel = status === "PENDING" || status === "CONFIRMED" || status === "NO_SHOW";
  const kinds = CANCEL_KINDS.filter((k) => !(k.status === "NO_SHOW" && status === "NO_SHOW"));
  const chosen = CANCEL_KINDS.find((k) => k.key === cancelKind) ?? null;

  function confirmCancel() {
    setActionError(null);
    if (!chosen) return setActionError("Choose a reason.");
    if (chosen.key === "OTHER" && !cancelReason.trim()) return setActionError("Please write the reason.");
    const note = cancelReason.trim();
    start(async () => {
      const res =
        chosen.status === "NO_SHOW"
          ? await setBookingStatus(preview.id, "NO_SHOW")
          : await setBookingStatus(
              preview.id,
              "CANCELLED",
              cancelNotify,
              chosen.key === "OTHER" ? note : note ? `${chosen.label}: ${note}` : chosen.label,
            );
      if (res.error) {
        setActionError(res.error);
      } else {
        router.refresh();
        onClose();
      }
    });
  }

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

  function toggleArrived(arrived: boolean) {
    setActionError(null);
    start(async () => {
      const res = await setBookingArrived(preview.id, arrived);
      if (res.error) setActionError(res.error);
      else {
        setReloadKey((k) => k + 1);
        router.refresh();
      }
    });
  }

  function openPayment() {
    const owing = details
      ? Math.max(0, details.priceCents - details.paidCents - details.voucherAppliedCents)
      : preview.priceCents;
    setPayMethod((details?.checkoutMethod as CheckoutMethod | null) ?? null);
    setPayAmount(((details?.checkoutCents ?? owing) / 100).toFixed(2));
    setPayAndComplete(status === "PENDING" || status === "CONFIRMED");
    setPayOpen(true);
  }

  function savePayment() {
    setActionError(null);
    const cents = Math.round(parseFloat(payAmount) * 100);
    if (!payMethod) return setActionError("Choose how they paid.");
    if (!Number.isFinite(cents) || cents < 0) return setActionError("Enter the amount paid.");
    start(async () => {
      const res = await recordCheckout(preview.id, payMethod, cents);
      if (res.error) return setActionError(res.error);
      if (payAndComplete && canComplete) {
        const done = await setBookingStatus(preview.id, "COMPLETED");
        if (done.error) {
          setPayOpen(false);
          setReloadKey((k) => k + 1);
          router.refresh();
          return setActionError(`Payment saved, but the booking wasn't marked completed: ${done.error}`);
        }
      }
      setPayOpen(false);
      setReloadKey((k) => k + 1);
      router.refresh();
    });
  }

  function bookAgain() {
    if (!details || !onBookAgain) return;
    const nextWeek = new Date(preview.startsAt.getTime() + 7 * 24 * 3600 * 1000);
    onBookAgain({
      title: "Book again",
      date: sydDate.format(nextWeek),
      time: sydTime.format(preview.startsAt),
      therapistId: details.therapistId ?? "",
      client: { id: details.client.id, name: details.client.name, phone: details.client.phone },
      serviceId: details.serviceId,
      variantId: details.variantId,
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
          <dd className="min-w-0">
            {preview.clientPhone ? (
              <span className="flex flex-wrap items-center gap-2">
                <span>{preview.clientPhone}</span>
                <a href={`tel:${preview.clientPhone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-accent">
                  <Phone className="h-3 w-3" /> Call
                </a>
                <a href={`sms:${preview.clientPhone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-accent">
                  <MessageSquare className="h-3 w-3" /> Text
                </a>
              </span>
            ) : (
              "—"
            )}
          </dd>

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

          {details?.client.preferences && (
            <>
              <dt className="text-muted-foreground">Preferences</dt>
              <dd className="min-w-0 whitespace-pre-wrap">{details.client.preferences}</dd>
            </>
          )}

          {details?.clientConfirmedAtIso && (
            <>
              <dt className="text-muted-foreground">Confirmed</dt>
              <dd className="min-w-0 text-teal-700 dark:text-teal-400">
                ✓ Client confirmed {details.clientConfirmedVia === "SMS" ? "by text" : "by email"},{" "}
                {confirmedWhen.format(new Date(details.clientConfirmedAtIso))}
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
        {details && status !== "CANCELLED" && status !== "NO_SHOW" && (
          <div className="mt-4 rounded-md border p-3 text-sm space-y-2">
            {!payOpen ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                {details.checkoutMethod ? (
                  <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                    ✓ Paid {formatPrice(details.checkoutCents ?? 0)} by{" "}
                    {CHECKOUT_LABEL[details.checkoutMethod as CheckoutMethod] ?? details.checkoutMethod}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Payment at the clinic not recorded yet.</span>
                )}
                <Button size="sm" variant={details.checkoutMethod ? "outline" : "default"} onClick={openPayment} disabled={pending}>
                  <Wallet className="h-4 w-4 mr-1" />
                  {details.checkoutMethod ? "Change payment" : "Take payment"}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="font-medium">How did they pay?</div>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Payment method">
                  {CHECKOUT_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={payMethod === m}
                      onClick={() => setPayMethod(m)}
                      className={`rounded-md border px-2.5 py-1 text-sm ${payMethod === m ? "border-primary bg-primary/10 text-primary font-medium" : "hover:bg-accent"}`}
                    >
                      {CHECKOUT_LABEL[m]}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2">
                  <span className="text-muted-foreground">Amount $</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="h-9 w-28 rounded-md border bg-background px-2 tabular-nums"
                    aria-label="Amount paid"
                  />
                </label>
                {canComplete && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={payAndComplete} onChange={(e) => setPayAndComplete(e.target.checked)} />
                    <span>Also mark the booking completed</span>
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={savePayment} disabled={pending}>
                    Save payment
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPayOpen(false)} disabled={pending}>
                    Cancel
                  </Button>
                  {details.checkoutMethod && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() =>
                        start(async () => {
                          const res = await recordCheckout(preview.id, null, 0);
                          if (res.error) setActionError(res.error);
                          setPayOpen(false);
                          setReloadKey((k) => k + 1);
                          router.refresh();
                        })
                      }
                    >
                      Remove payment
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {loadError && <p className="text-sm text-red-600 mt-3">{loadError}</p>}
        {actionError && <p className="text-sm text-red-600 mt-3">{actionError}</p>}

        <div className="flex flex-wrap gap-2 mt-5">
          {details && (status === "PENDING" || status === "CONFIRMED") && (
            details.arrivedAtIso ? (
              <Button size="sm" variant="outline" onClick={() => toggleArrived(false)} disabled={pending}>
                <DoorOpen className="h-4 w-4 mr-1" />
                Undo arrived
              </Button>
            ) : (
              <Button size="sm" className="bg-sky-600 hover:bg-sky-700 text-white" onClick={() => toggleArrived(true)} disabled={pending}>
                <DoorOpen className="h-4 w-4 mr-1" />
                Arrived
              </Button>
            )
          )}
          {canComplete && (
            <Button size="sm" onClick={() => setStatus("COMPLETED")} disabled={pending}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Mark completed
            </Button>
          )}
          {canCancel && !confirmingCancel && (
            <Button
              size="sm"
              variant="outline"
              className="text-red-700 border-red-300 hover:bg-red-50 dark:text-red-400 dark:border-red-900 dark:hover:bg-red-950/40"
              onClick={() => setConfirmingCancel(true)}
              disabled={pending}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Cancel booking
            </Button>
          )}
          {canCancel && confirmingCancel && (
            <div className="basis-full w-full rounded-md border border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3 space-y-2 text-sm">
              <p className="font-medium">Why is this booking cancelled?</p>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cancel reason">
                {kinds.map((k) => (
                  <button
                    key={k.key}
                    type="button"
                    role="radio"
                    aria-checked={cancelKind === k.key}
                    onClick={() => {
                      setCancelKind(k.key);
                      setCancelNotify(k.notify);
                    }}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      cancelKind === k.key
                        ? "border-red-600 bg-red-600 text-white"
                        : "border-red-300 bg-background hover:bg-red-100 dark:hover:bg-red-950/40"
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
              {chosen && (
                <>
                  <p className="text-xs text-muted-foreground">
                    {chosen.status === "NO_SHOW"
                      ? "Marked as a no-show. The time is freed and the waitlist is told."
                      : "The time becomes free again and anyone on the waitlist for that day is told."}
                  </p>
                  <input
                    aria-label="Reason for cancelling"
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                    placeholder={chosen.key === "OTHER" ? "Write the reason" : "Note (optional)"}
                    maxLength={250}
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                  />
                  {chosen.status === "CANCELLED" && (
                    <label className="flex items-start gap-2">
                      <input type="checkbox" className="mt-1" checked={cancelNotify} onChange={(e) => setCancelNotify(e.target.checked)} />
                      <span>Email/text the client that it&rsquo;s cancelled</span>
                    </label>
                  )}
                </>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={confirmCancel} disabled={pending || !chosen}>
                  {pending ? "Saving…" : chosen?.status === "NO_SHOW" ? "Mark as no-show" : "Yes, cancel booking"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setConfirmingCancel(false);
                    setCancelKind(null);
                    setCancelReason("");
                  }}
                  disabled={pending}
                >
                  Keep booking
                </Button>
              </div>
            </div>
          )}
          {details && onBookAgain && (
            <Button size="sm" variant="outline" onClick={bookAgain} disabled={pending}>
              <Repeat className="h-4 w-4 mr-1" />
              Book again
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
