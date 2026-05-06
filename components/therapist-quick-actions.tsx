"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  therapistId: string;
  therapistName: string;
  isActive: boolean;
  /** Sydney YYYY-MM-DD that the schedule is currently displaying. */
  dateStr: string;
  addTimeOffAction: (
    fd: FormData,
  ) => Promise<{ ok?: boolean; error?: string }>;
  toggleActiveAction: (
    fd: FormData,
  ) => Promise<{ ok?: boolean; error?: string }>;
};

/**
 * Per-therapist quick-actions menu rendered in the schedule grid column
 * header. Lets staff add common TimeOff blocks (lunch, late start, early
 * finish, custom) and toggle the therapist's active flag without leaving the
 * schedule page. Uses raw primitives + state (no shadcn DropdownMenu/Dialog,
 * which aren't generated in this repo).
 */
export function TherapistQuickActions({
  therapistId,
  therapistName,
  isActive,
  dateStr,
  addTimeOffAction,
  toggleActiveAction,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [fromTime, setFromTime] = useState("12:00");
  const [toTime, setToTime] = useState("13:00");
  const [reason, setReason] = useState("Lunch");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click. Re-binds when popover opens.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
        setShowCustom(false);
        setCustomError(null);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // Compose datetime-local string for the displayed Sydney day.
  function dt(hours: number, minutes: number): string {
    const h = String(hours).padStart(2, "0");
    const m = String(minutes).padStart(2, "0");
    return `${dateStr}T${h}:${m}`;
  }

  function applyPreset(
    label: string,
    fromH: number,
    fromM: number,
    toH: number,
    toM: number,
  ) {
    const fd = new FormData();
    fd.set("therapistId", therapistId);
    fd.set("startsAt", dt(fromH, fromM));
    fd.set("endsAt", dt(toH, toM));
    fd.set("reason", label);
    startTransition(async () => {
      const res = await addTimeOffAction(fd);
      if (res.error) {
        alert(`Failed to block: ${res.error}`);
      } else {
        setOpen(false);
      }
    });
  }

  function submitCustom() {
    setCustomError(null);
    if (!fromTime || !toTime) {
      setCustomError("Both From and To required.");
      return;
    }
    const [fH, fM] = fromTime.split(":").map(Number);
    const [tH, tM] = toTime.split(":").map(Number);
    if (
      Number.isNaN(fH) || Number.isNaN(fM) ||
      Number.isNaN(tH) || Number.isNaN(tM)
    ) {
      setCustomError("Invalid time format.");
      return;
    }
    if (tH * 60 + tM <= fH * 60 + fM) {
      setCustomError("End must be after start.");
      return;
    }
    const fd = new FormData();
    fd.set("therapistId", therapistId);
    fd.set("startsAt", dt(fH, fM));
    fd.set("endsAt", dt(tH, tM));
    fd.set("reason", reason);
    startTransition(async () => {
      const res = await addTimeOffAction(fd);
      if (res.error) {
        setCustomError(res.error);
      } else {
        setOpen(false);
        setShowCustom(false);
        setFromTime("12:00");
        setToTime("13:00");
        setReason("Lunch");
      }
    });
  }

  function toggleActive() {
    const verb = isActive ? "deactivate" : "activate";
    if (!confirm(`${verb[0].toUpperCase() + verb.slice(1)} ${therapistName}?`)) return;
    const fd = new FormData();
    fd.set("id", therapistId);
    startTransition(async () => {
      const res = await toggleActiveAction(fd);
      if (res.error) {
        alert(`Failed: ${res.error}`);
      } else {
        setOpen(false);
      }
    });
  }

  const itemClass =
    "w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:pointer-events-none";

  return (
    <div ref={containerRef} className="relative shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        aria-label={`Quick actions for ${therapistName}`}
        aria-expanded={open}
        title="Quick actions"
      >
        <MoreVertical className="h-4 w-4" />
      </Button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 z-50 w-64 rounded-md border bg-popover text-popover-foreground shadow-md p-1"
        >
          <div className="px-2 py-1.5 text-xs text-muted-foreground border-b mb-1">
            Block on {dateStr}
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => applyPreset("Lunch", 12, 0, 13, 0)}
            className={itemClass}
          >
            Lunch (12 – 1pm)
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => applyPreset("Late start", 9, 0, 11, 0)}
            className={itemClass}
          >
            Late start (until 11am)
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => applyPreset("Early finish", 16, 0, 20, 30)}
            className={itemClass}
          >
            Early finish (from 4pm)
          </button>
          {!showCustom ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => setShowCustom(true)}
              className={itemClass}
            >
              Custom block…
            </button>
          ) : (
            <div className="px-2 py-2 space-y-2 border-t mt-1">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="qa-from" className="text-xs">From</Label>
                  <Input
                    id="qa-from"
                    type="time"
                    value={fromTime}
                    onChange={(e) => setFromTime(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="qa-to" className="text-xs">To</Label>
                  <Input
                    id="qa-to"
                    type="time"
                    value={toTime}
                    onChange={(e) => setToTime(e.target.value)}
                    className="h-8"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="qa-reason" className="text-xs">Reason</Label>
                <Input
                  id="qa-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Lunch, Personal"
                  maxLength={500}
                  className="h-8"
                />
              </div>
              {customError && (
                <p className="text-xs text-destructive">{customError}</p>
              )}
              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowCustom(false);
                    setCustomError(null);
                  }}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={submitCustom}
                  disabled={pending}
                >
                  {pending ? "Adding…" : "Add block"}
                </Button>
              </div>
            </div>
          )}
          <div className="border-t my-1" />
          <button
            type="button"
            disabled={pending}
            onClick={toggleActive}
            className={
              itemClass +
              (isActive ? " text-destructive hover:text-destructive" : "")
            }
          >
            {isActive ? "Deactivate" : "Activate"} {therapistName}
          </button>
        </div>
      )}
    </div>
  );
}
