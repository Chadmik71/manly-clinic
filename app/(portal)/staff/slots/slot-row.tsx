"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export interface SlotItem {
  id: string;
  label: string;
  active: boolean;
}

export function SlotRow({
  slot,
  renameAction,
  toggleAction,
  deleteAction,
}: {
  slot: SlotItem;
  renameAction: (
    fd: FormData,
  ) => Promise<{ ok?: boolean; error?: string }>;
  toggleAction: (
    fd: FormData,
  ) => Promise<{ ok?: boolean; error?: string }>;
  deleteAction: (
    fd: FormData,
  ) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [label, setLabel] = useState(slot.label);
  const [err, setErr] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const dirty = label.trim() !== slot.label;

  function rename() {
    setErr(null);
    const fd = new FormData();
    fd.set("id", slot.id);
    fd.set("label", label.trim());
    start(async () => {
      const r = await renameAction(fd);
      if (r?.error) setErr(r.error);
      else router.refresh();
    });
  }

  function toggle() {
    setErr(null);
    const fd = new FormData();
    fd.set("id", slot.id);
    start(async () => {
      const r = await toggleAction(fd);
      if (r?.error) setErr(r.error);
      else router.refresh();
    });
  }

  function doDelete() {
    setErr(null);
    const fd = new FormData();
    fd.set("id", slot.id);
    start(async () => {
      const r = await deleteAction(fd);
      if (r?.error) {
        setErr(r.error);
        setConfirmingDelete(false);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={label}
          onChange={(e) => {
            setLabel(e.target.value);
            setErr(null);
          }}
          disabled={pending}
          className="max-w-[220px]"
          maxLength={80}
        />
        {dirty && (
          <Button
            onClick={rename}
            disabled={pending || label.trim().length === 0}
            size="sm"
          >
            Save
          </Button>
        )}
        <Badge variant={slot.active ? "success" : "secondary"}>
          {slot.active ? "active" : "inactive"}
        </Badge>
        <div className="ml-auto flex gap-2">
          <Button
            onClick={toggle}
            disabled={pending}
            size="sm"
            variant="outline"
          >
            {slot.active ? "Deactivate" : "Activate"}
          </Button>
          {!confirmingDelete ? (
            <Button
              onClick={() => setConfirmingDelete(true)}
              disabled={pending}
              size="sm"
              variant="ghost"
              className="text-destructive"
            >
              Delete
            </Button>
          ) : (
            <>
              <Button
                onClick={doDelete}
                disabled={pending}
                size="sm"
                variant="destructive"
              >
                {pending ? "Deleting\u2026" : "Confirm delete"}
              </Button>
              <Button
                onClick={() => setConfirmingDelete(false)}
                disabled={pending}
                size="sm"
                variant="outline"
              >
                Back
              </Button>
            </>
          )}
        </div>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
    </div>
  );
}
