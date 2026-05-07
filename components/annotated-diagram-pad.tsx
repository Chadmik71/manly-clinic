"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Free-form annotation pad over a body silhouette. Used by staff in the
 * booking detail page to circle trigger points, jot "adhesion", etc.
 * directly on the diagram. The whole canvas (silhouette + annotations) is
 * captured as a PNG data URL so it can be redrawn read-only on later views
 * without needing the silhouette code.
 *
 * View / edit modes:
 *   - View: shows the saved PNG (or a blank silhouette if none yet).
 *   - Edit: pointer events draw on top; Save persists, Cancel reverts.
 */

// Inline silhouette SVG. Same shapes as BodyDiagram for visual consistency.
// Drawn into the canvas as the editable background; staff annotates on top.
const BODY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 220">' +
  '<g stroke="#94a3b8" stroke-width="1" stroke-linejoin="round" fill="rgba(148,163,184,0.10)">' +
  // FRONT view, x = 0..120
  '<ellipse cx="60" cy="24" rx="11" ry="13"/>' +
  '<rect x="56" y="35" width="8" height="7"/>' +
  '<path d="M 38 45 L 32 60 L 34 110 L 50 112 L 50 130 L 70 130 L 70 112 L 86 110 L 88 60 L 82 45 Z"/>' +
  '<path d="M 32 50 L 24 75 L 18 130 L 26 132 L 30 100 L 36 65 Z"/>' +
  '<path d="M 88 50 L 96 75 L 102 130 L 94 132 L 90 100 L 84 65 Z"/>' +
  '<path d="M 50 130 L 47 175 L 45 215 L 56 215 L 57 175 L 60 130 Z"/>' +
  '<path d="M 60 130 L 63 175 L 64 215 L 75 215 L 73 175 L 70 130 Z"/>' +
  // BACK view, translated +120 in x
  '<g transform="translate(120 0)">' +
  '<ellipse cx="60" cy="24" rx="11" ry="13"/>' +
  '<rect x="56" y="35" width="8" height="7"/>' +
  '<path d="M 38 45 L 32 60 L 34 110 L 50 112 L 50 130 L 70 130 L 70 112 L 86 110 L 88 60 L 82 45 Z"/>' +
  '<path d="M 32 50 L 24 75 L 18 130 L 26 132 L 30 100 L 36 65 Z"/>' +
  '<path d="M 88 50 L 96 75 L 102 130 L 94 132 L 90 100 L 84 65 Z"/>' +
  '<path d="M 50 130 L 47 175 L 45 215 L 56 215 L 57 175 L 60 130 Z"/>' +
  '<path d="M 60 130 L 63 175 L 64 215 L 75 215 L 73 175 L 70 130 Z"/>' +
  '</g>' +
  // View labels
  '<text x="60" y="10" text-anchor="middle" font-size="9" fill="#94a3b8">Front</text>' +
  '<text x="180" y="10" text-anchor="middle" font-size="9" fill="#94a3b8">Back</text>' +
  '</g></svg>';

const VIEW_W = 480; // CSS pixels
const VIEW_H = 440;

type Props = {
  /** Existing saved annotation PNG, or null if there is none yet. */
  initialDataUrl: string | null;
  /** Save callback — receives the new PNG data URL or null when cleared. */
  onSave: (dataUrl: string | null) => Promise<void> | void;
  /** Disables Edit / Save buttons (e.g. while submit is pending). */
  disabled?: boolean;
};

export function AnnotatedDiagramPad({ initialDataUrl, onSave, disabled }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [savedDataUrl, setSavedDataUrl] = useState<string | null>(initialDataUrl);
  const [pending, setPending] = useState(false);
  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);

  // Initialise / reset the canvas. Loads the saved PNG when present,
  // otherwise renders the silhouette as a fresh background. Re-runs when
  // mode flips (so cancelling discards in-progress strokes).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = VIEW_W * dpr;
    canvas.height = VIEW_H * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);

    const drawSilhouette = () => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, VIEW_W, VIEW_H);
      };
      img.src =
        "data:image/svg+xml;utf8," + encodeURIComponent(BODY_SVG);
    };

    if (savedDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, VIEW_W, VIEW_H);
      };
      img.onerror = drawSilhouette;
      img.src = savedDataUrl;
    } else {
      drawSilhouette();
    }

    // Stroke style for new annotations.
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = "#dc2626"; // red-600
  }, [mode, savedDataUrl]);

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const sx = VIEW_W / rect.width;
    const sy = VIEW_H / rect.height;
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (mode !== "edit" || disabled) return;
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPt.current = pointerPos(e);
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const pt = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPt.current!.x, lastPt.current!.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPt.current = pt;
  }

  function onUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    lastPt.current = null;
    try {
      canvasRef.current!.releasePointerCapture(e.pointerId);
    } catch {
      // ignore — pointer might already be released
    }
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setPending(true);
    try {
      const dataUrl = canvas.toDataURL("image/png");
      await onSave(dataUrl);
      setSavedDataUrl(dataUrl);
      setMode("view");
    } finally {
      setPending(false);
    }
  }

  async function handleClear() {
    setPending(true);
    try {
      await onSave(null);
      setSavedDataUrl(null);
      setMode("view");
    } finally {
      setPending(false);
    }
  }

  function handleCancel() {
    // Re-running useEffect via mode flip will redraw from savedDataUrl,
    // discarding any unsaved strokes.
    setMode("view");
  }

  const isEdit = mode === "edit";

  return (
    <div className="space-y-2">
      <div
        className="rounded-md border bg-white inline-block"
        style={{ touchAction: "none", maxWidth: "100%" }}
      >
        <canvas
          ref={canvasRef}
          aria-label="Body diagram annotation pad"
          role="img"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onPointerLeave={onUp}
          style={{
            display: "block",
            width: VIEW_W,
            height: VIEW_H,
            maxWidth: "100%",
            touchAction: "none",
            cursor: isEdit && !disabled ? "crosshair" : "default",
          }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!isEdit && (
          <button
            type="button"
            onClick={() => setMode("edit")}
            disabled={disabled || pending}
            className="text-sm rounded-md border px-3 py-1.5 hover:bg-accent disabled:opacity-50"
          >
            {savedDataUrl ? "Edit annotations" : "Add annotations"}
          </button>
        )}
        {isEdit && (
          <>
            <button
              type="button"
              onClick={handleSave}
              disabled={disabled || pending}
              className="text-sm rounded-md bg-primary text-primary-foreground px-3 py-1.5 hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={disabled || pending}
              className="text-sm rounded-md border px-3 py-1.5 hover:bg-accent disabled:opacity-50"
            >
              Cancel
            </button>
          </>
        )}
        {savedDataUrl && (
          <button
            type="button"
            onClick={handleClear}
            disabled={disabled || pending}
            className="text-sm text-destructive hover:underline disabled:opacity-50 ml-auto"
          >
            Remove all annotations
          </button>
        )}
      </div>
      {isEdit && (
        <p className="text-xs text-muted-foreground">
          Draw with your finger, pen, or mouse. Save when done; Cancel discards changes.
        </p>
      )}
    </div>
  );
}
