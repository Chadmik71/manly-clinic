"use client";

import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/** Answers that mean "nothing to report" (also how earlier free-text answers
 *  like "none" or "n/a" are recognised when a form is pre-filled). */
const NONE_RE = /^\s*(none|no|nil|n\/?a|nothing|-+)\s*\.?\s*$/i;
export const NONE_VALUE = "None";

/**
 * Health-form question answered with No / Yes. "No" submits "None"; "Yes"
 * opens a box for the details (then required). The value travels in a hidden
 * input called `name`, so it drops into the existing FormData-based forms.
 * The details box keeps `id`, so existing labels and tests still find it.
 */
export function YesNoField({
  id,
  name,
  label,
  question,
  defaultValue,
  placeholder,
  required = false,
  multiline = true,
}: {
  id: string;
  name: string;
  /** Short heading, e.g. "Current medications". */
  label: string;
  /** The question asked, e.g. "Do you take any medications?" */
  question: string;
  defaultValue?: string | null;
  placeholder?: string;
  /** Must choose No or Yes (and fill in the details on Yes). */
  required?: boolean;
  multiline?: boolean;
}) {
  const initial = (defaultValue ?? "").trim();
  const [choice, setChoice] = useState<"no" | "yes" | null>(
    initial === "" ? null : NONE_RE.test(initial) ? "no" : "yes",
  );
  const [detail, setDetail] = useState(initial && !NONE_RE.test(initial) ? initial : "");

  const value = choice === "no" ? NONE_VALUE : choice === "yes" ? detail : "";
  const pill = (on: boolean) =>
    cn(
      "flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm cursor-pointer select-none",
      on ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
    );

  return (
    <div className="space-y-2">
      <Label>
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <p className="text-sm">{question}</p>
      <div className="flex gap-2" role="radiogroup" aria-label={question}>
        <label className={pill(choice === "no")}>
          <input
            type="radio"
            className="sr-only"
            name={`${name}__yn`}
            value="no"
            checked={choice === "no"}
            onChange={() => setChoice("no")}
            required={required}
          />
          No
        </label>
        <label className={pill(choice === "yes")}>
          <input
            type="radio"
            className="sr-only"
            name={`${name}__yn`}
            value="yes"
            checked={choice === "yes"}
            onChange={() => setChoice("yes")}
            required={required}
          />
          Yes
        </label>
      </div>
      {choice === "yes" &&
        (multiline ? (
          <Textarea
            id={id}
            aria-label={`${label}: details`}
            required
            autoFocus={initial === ""}
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={placeholder}
          />
        ) : (
          <input
            id={id}
            aria-label={`${label}: details`}
            required
            autoFocus={initial === ""}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            placeholder={placeholder}
          />
        ))}
      <input type="hidden" name={name} value={value} />
    </div>
  );
}
