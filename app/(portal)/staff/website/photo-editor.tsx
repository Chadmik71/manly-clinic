"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetSiteImage, saveSiteImage } from "./actions";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_EDGE = 2000;
const TARGET_BYTES = 900_000;
const QUALITIES = [0.82, 0.74, 0.66, 0.58, 0.5];

type Status = null | { kind: "ok"; message: string } | { kind: "error"; message: string };
type Prepared = { blob: Blob; url: string; width: number; height: number };

/** Shrinks a photo so its long edge is at most 2000 px and re-saves it as a JPEG under 900 KB. */
async function preparePhoto(file: File): Promise<Prepared> {
  if (!ACCEPTED.includes(file.type)) throw new Error("Please choose a JPEG, PNG or WebP photo.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That file couldn't be opened as a photo. Please choose a different one.");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't prepare photos. Please try Chrome or Safari.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  for (const q of QUALITIES) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
    if (blob && blob.size < TARGET_BYTES) return { blob, url: URL.createObjectURL(blob), width, height };
  }
  throw new Error("That photo is too detailed to shrink enough. Please choose a different one.");
}

export function PhotoEditor({
  slotKey,
  label,
  help,
  sizeHint,
  src,
  alt,
  defaultAlt,
  isCustom,
  lastChanged,
  altMax,
}: {
  slotKey: string;
  label: string;
  help: string;
  sizeHint: string;
  src: string;
  alt: string;
  defaultAlt: string;
  isCustom: boolean;
  lastChanged: string | null;
  altMax: number;
}) {
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [altDraft, setAltDraft] = useState(alt);
  const [seenAlt, setSeenAlt] = useState(alt);
  const [status, setStatus] = useState<Status>(null);
  const [pending, startTransition] = useTransition();
  const [inputKey, setInputKey] = useState(0);

  if (alt !== seenAlt) {
    setSeenAlt(alt);
    setAltDraft(alt);
  }
  useEffect(() => () => {
    if (prepared) URL.revokeObjectURL(prepared.url);
  }, [prepared]);

  const id = `photo-${slotKey}`;
  const altChanged = altDraft.trim() !== alt;
  const canSave = !!prepared || (isCustom && altChanged);

  async function onPick(file: File | undefined) {
    setStatus(null);
    setPrepared(null);
    if (!file) return;
    setPreparing(true);
    try {
      setPrepared(await preparePhoto(file));
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "That photo couldn't be used." });
      setInputKey((k) => k + 1);
    } finally {
      setPreparing(false);
    }
  }

  function clearPick() {
    setPrepared(null);
    setInputKey((k) => k + 1);
  }

  function save() {
    setStatus(null);
    const form = new FormData();
    form.set("key", slotKey);
    form.set("alt", altDraft);
    if (prepared) form.set("file", new File([prepared.blob], `${slotKey}.jpg`, { type: "image/jpeg" }));
    startTransition(async () => {
      const r = await saveSiteImage(form);
      if (r.ok) {
        clearPick();
        setStatus({ kind: "ok", message: "Saved. The website is updated." });
      } else {
        setStatus({ kind: "error", message: r.error });
      }
    });
  }

  function reset() {
    setStatus(null);
    startTransition(async () => {
      const r = await resetSiteImage(slotKey);
      if (r.ok) {
        clearPick();
        setStatus({ kind: "ok", message: "Back to the original photo." });
      } else {
        setStatus({ kind: "error", message: r.error });
      }
    });
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <div>
        <div className="text-sm font-medium">{label}</div>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      <div className="flex flex-wrap gap-4">
        <figure className="space-y-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="h-28 w-44 rounded-md border object-cover" />
          <figcaption className="text-xs text-muted-foreground">{isCustom ? "Your photo" : "Original photo"}</figcaption>
        </figure>
        {prepared && (
          <figure className="space-y-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={prepared.url} alt="" className="h-28 w-44 rounded-md border object-cover ring-2 ring-primary" />
            <figcaption className="text-xs text-muted-foreground">
              New photo, not saved yet ({prepared.width}×{prepared.height})
            </figcaption>
          </figure>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-file`}>Choose a new photo</Label>
        <Input
          key={inputKey}
          id={`${id}-file`}
          type="file"
          accept={ACCEPTED.join(",")}
          disabled={pending || preparing}
          onChange={(e) => onPick(e.target.files?.[0])}
        />
        <p className="text-xs text-muted-foreground">{sizeHint} It is shrunk automatically before upload.</p>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${id}-alt`}>Description for screen readers and Google</Label>
        <Input
          id={`${id}-alt`}
          value={altDraft}
          maxLength={altMax}
          placeholder={defaultAlt}
          onChange={(e) => setAltDraft(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          {altDraft.length} / {altMax}. {isCustom ? "Leave empty to use the original description." : "Saved together with a new photo."}
        </p>
      </div>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm" disabled={pending || preparing || !canSave}>
            {pending ? "Saving…" : preparing ? "Preparing photo…" : "Save"}
          </Button>
          {prepared && (
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={clearPick}>
              Cancel
            </Button>
          )}
          {isCustom && (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={reset}>
              Back to original
            </Button>
          )}
          {status && (
            <span className={status.kind === "ok" ? "text-xs text-green-700 dark:text-green-400" : "text-xs text-destructive"}>
              {status.message}
            </span>
          )}
        </div>
        {isCustom && lastChanged && <p className="text-xs text-muted-foreground">{lastChanged}</p>}
      </div>
    </form>
  );
}
