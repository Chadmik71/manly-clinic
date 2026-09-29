"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  /** Display width in CSS pixels. Default 600. */
  width?: number;
  /** Display height in CSS pixels. Default 180. */
  height?: number;
  /** Called with the data URL after each completed stroke, or null when cleared. */
  onChange: (dataUrl: string | null) => void;
  /** Disables drawing — useful while the form is submitting. */
  disabled?: boolean;
  /** Optional label for accessibility. */
  ariaLabel?: string;
};

/**
 * Lightweight canvas-based signature pad. Pointer events handle mouse,
 * pen, and touch on every modern browser without an external library.
 * Emits a base64 PNG data URL via onChange after each completed stroke,
 * or null when the pad is cleared.
 */
export function SignaturePad({
  width = 600,
  height = 180,
  onChange,
  disabled,
  ariaLabel = "Signature pad",
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  // Ref as well as state: a very quick stroke can end before React
  // re-renders, and the end handler must still see that ink was drawn.
  const hasInk = useRef(false);
  const [isEmpty, setIsEmpty] = useState(true);

  // HiDPI-aware canvas setup. Sets the bitmap size to width*dpr so
  // signatures stay sharp on Retina / mobile screens.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    // Fixed colour (slate-900) so the saved PNG renders legibly regardless
    // of the (possibly dark) page background.
    ctx.strokeStyle = "#0f172a";
  }, [width, height]);

  // The drawing space is always width x height, but the canvas is shown at
  // width: 100%, so on phones/tablets it's squeezed narrower. Scale the
  // pointer position into drawing space, or strokes land left of the finger.
  function toCanvas(clientX: number, clientY: number) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) * width) / rect.width,
      y: ((clientY - rect.top) * height) / rect.height,
    };
  }

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    return toCanvas(e.clientX, e.clientY);
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    e.preventDefault();
    canvasRef.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPt.current = pointerPos(e);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    // Browsers batch fast touch/pen movement into one event; the coalesced
    // list holds every intermediate point, so fast strokes stay smooth.
    const native = e.nativeEvent;
    const samples =
      typeof native.getCoalescedEvents === "function" && native.getCoalescedEvents().length > 0
        ? native.getCoalescedEvents()
        : [native];
    ctx.beginPath();
    ctx.moveTo(lastPt.current!.x, lastPt.current!.y);
    for (const s of samples) {
      const pt = toCanvas(s.clientX, s.clientY);
      ctx.lineTo(pt.x, pt.y);
      lastPt.current = pt;
    }
    ctx.stroke();
    hasInk.current = true;
    if (isEmpty) setIsEmpty(false);
  }

  function end(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    lastPt.current = null;
    try {
      canvasRef.current!.releasePointerCapture(e.pointerId);
    } catch {
      // releasePointerCapture throws if pointerId was never captured;
      // safe to ignore.
    }
    if (hasInk.current) {
      onChange(canvasRef.current!.toDataURL("image/png"));
    }
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Clear in raw device pixels, then re-establish DPR scaling so the
    // next stroke draws at the correct resolution.
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#0f172a";
    hasInk.current = false;
    setIsEmpty(true);
    onChange(null);
  }

  return (
    <div className="space-y-2">
      <div
        className="rounded-md border bg-white"
        style={{ width: "100%", maxWidth: width, touchAction: "none" }}
      >
        <canvas
          ref={canvasRef}
          aria-label={ariaLabel}
          role="img"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={end}
          style={{
            display: "block",
            width: "100%",
            maxWidth: width,
            height,
            touchAction: "none",
            cursor: disabled ? "not-allowed" : "crosshair",
          }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{isEmpty ? "Sign with your finger or mouse" : "Signature captured ✓"}</span>
        <button
          type="button"
          onClick={clear}
          disabled={isEmpty || disabled}
          className="text-primary hover:underline disabled:opacity-40 disabled:no-underline"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
