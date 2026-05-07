"use client";

import { useState, useTransition } from "react";
import { AnnotatedDiagramPad } from "@/components/annotated-diagram-pad";

/**
 * Thin client wrapper that calls the updateBookingAnnotation server action
 * when the AnnotatedDiagramPad emits a save. Surfaces validation errors
 * from the action below the pad. Keeps page.tsx a pure server component.
 */
export function AnnotatedDiagramSection({
  bookingId,
  initialDataUrl,
  action,
}: {
  bookingId: string;
  initialDataUrl: string | null;
  action: (
    bookingId: string,
    dataUrl: string | null,
  ) => Promise<{ ok?: boolean; error?: string }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSave(dataUrl: string | null) {
    return new Promise<void>((resolve) => {
      setError(null);
      startTransition(async () => {
        const result = await action(bookingId, dataUrl);
        if (result.error) setError(result.error);
        resolve();
      });
    });
  }

  return (
    <div className="space-y-2">
      <AnnotatedDiagramPad
        initialDataUrl={initialDataUrl}
        onSave={onSave}
        disabled={pending}
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
