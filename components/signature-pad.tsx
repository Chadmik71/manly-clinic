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

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
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
    const pt = pointerPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPt.current!.x, lastPt.current!.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPt.current = pt;
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
    if (!isEmpty) {
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
