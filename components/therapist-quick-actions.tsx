"use client";

import { useState, useTransition } from "react";
import { MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
 * Per-therapist menu rendered in the schedule grid column header. Lets staff
 * quickly add common TimeOff blocks (lunch, late start, early finish, custom)
 * and toggle the therapist's active flag — without leaving the schedule page.
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
  const [customOpen, setCustomOpen] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [fromTime, setFromTime] = useState("12:00");
  const [toTime, setToTime] = useState("13:00");
  const [reason, setReason] = useState("Lunch");

  // Compose a datetime-local string ("YYYY-MM-DDTHH:mm") for the displayed day.
  // The browser interprets this as local time, which for Australian admins is
  // Sydney time — matching the rest of the booking flow's TZ assumptions.
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
        // No toast system in this app — fall back to alert. Errors here
        // typically only fire for validation issues (e.g. end before start),
        // which the presets never produce.
        alert(`Failed to block: ${res.error}`);
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
        setCustomOpen(false);
        // Reset form for next use.
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
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            disabled={pending}
            aria-label={`Quick actions for ${therapistName}`}
            title="Quick actions"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
            Block on {dateStr}
          </DropdownMenuLabel>
          <DropdownMenuItem
            onClick={() => applyPreset("Lunch", 12, 0, 13, 0)}
            disabled={pending}
          >
            Lunch (12 – 1pm)
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => applyPreset("Late start", 9, 0, 11, 0)}
            disabled={pending}
          >
            Late start (until 11am)
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => applyPreset("Early finish", 16, 0, 20, 30)}
            disabled={pending}
          >
            Early finish (from 4pm)
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setCustomOpen(true)}
            disabled={pending}
          >
            Custom block…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={toggleActive}
            disabled={pending}
            className={
              isActive
                ? "text-destructive focus:text-destructive"
                : "text-foreground"
            }
          >
            {isActive ? "Deactivate" : "Activate"} {therapistName}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Custom block</DialogTitle>
            <DialogDescription>
              Block a time window for {therapistName} on {dateStr}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="qa-from">From</Label>
                <Input
                  id="qa-from"
                  type="time"
                  value={fromTime}
                  onChange={(e) => setFromTime(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qa-to">To</Label>
                <Input
                  id="qa-to"
                  type="time"
                  value={toTime}
                  onChange={(e) => setToTime(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qa-reason">Reason</Label>
              <Input
                id="qa-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Lunch, Personal appointment"
                maxLength={500}
              />
            </div>
            {customError && (
              <p className="text-sm text-destructive">{customError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCustomOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button onClick={submitCustom} disabled={pending}>
              {pending ? "Adding…" : "Add block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
