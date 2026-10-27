"use client";

import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FaqItem } from "@/lib/site-content";
import { resetSiteContent, saveSiteContent, type SiteContentResult } from "./actions";

type Status = null | { kind: "ok"; message: string } | { kind: "error"; message: string };

type Common = {
  fieldKey: string;
  label: string;
  help: string;
  isCustom: boolean;
  lastChanged: string | null;
};

/** Local draft that resets whenever the saved value from the server changes. */
function useDraft<T>(saved: T): [T, (v: T | ((x: T) => T)) => void] {
  const [draft, setDraft] = useState(saved);
  const [seen, setSeen] = useState(JSON.stringify(saved));
  const savedJson = JSON.stringify(saved);
  if (savedJson !== seen) {
    setSeen(savedJson);
    setDraft(saved);
  }
  return [draft, setDraft];
}

function useSaver(fieldKey: string) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>(null);
  function run(action: () => Promise<SiteContentResult>, okMessage: string) {
    setStatus(null);
    startTransition(async () => {
      const r = await action();
      setStatus(r.ok ? { kind: "ok", message: okMessage } : { kind: "error", message: r.error });
    });
  }
  return {
    pending,
    status,
    save: (value: unknown) => run(() => saveSiteContent(fieldKey, value), "Saved. The website is updated."),
    reset: () => run(() => resetSiteContent(fieldKey), "Back to the original wording."),
  };
}

function Footer({
  pending,
  status,
  isCustom,
  lastChanged,
  onReset,
  dirty,
}: {
  pending: boolean;
  status: Status;
  isCustom: boolean;
  lastChanged: string | null;
  onReset: () => void;
  dirty: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending || !dirty}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {isCustom && (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={onReset}>
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
  );
}

export function TextFieldEditor({
  fieldKey,
  label,
  help,
  isCustom,
  lastChanged,
  value,
  multiline,
  maxLength,
}: Common & { value: string; multiline: boolean; maxLength: number }) {
  const [draft, setDraft] = useDraft(value);
  const { pending, status, save, reset } = useSaver(fieldKey);
  const id = `field-${fieldKey}`;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        save(draft);
      }}
    >
      <Label htmlFor={id}>{label}</Label>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      {multiline ? (
        <Textarea id={id} value={draft} maxLength={maxLength} rows={4} onChange={(e) => setDraft(e.target.value)} />
      ) : (
        <Input id={id} value={draft} maxLength={maxLength} onChange={(e) => setDraft(e.target.value)} />
      )}
      <p className="text-xs text-muted-foreground">
        {draft.length} / {maxLength}
      </p>
      <Footer
        pending={pending}
        status={status}
        isCustom={isCustom}
        lastChanged={lastChanged}
        dirty={draft !== value}
        onReset={reset}
      />
    </form>
  );
}

export function ToggleFieldEditor({
  fieldKey,
  label,
  help,
  isCustom,
  lastChanged,
  value,
}: Common & { value: boolean }) {
  const [draft, setDraft] = useDraft(value);
  const { pending, status, save, reset } = useSaver(fieldKey);
  const id = `field-${fieldKey}`;
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        save(draft);
      }}
    >
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
        <input id={id} type="checkbox" className="h-4 w-4" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
        {label}
      </label>
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
      <Footer
        pending={pending}
        status={status}
        isCustom={isCustom}
        lastChanged={lastChanged}
        dirty={draft !== value}
        onReset={reset}
      />
    </form>
  );
}

export function FaqEditor({
  fieldKey,
  label,
  help,
  isCustom,
  lastChanged,
  value,
  maxItems,
  questionMax,
  answerMax,
}: Common & { value: FaqItem[]; maxItems: number; questionMax: number; answerMax: number }) {
  const [items, setItems] = useDraft<FaqItem[]>(value);
  const { pending, status, save, reset } = useSaver(fieldKey);
  const dirty = JSON.stringify(items) !== JSON.stringify(value);

  function update(i: number, patch: Partial<FaqItem>) {
    setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }
  function move(i: number, d: -1 | 1) {
    setItems((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const next = xs.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        save(items);
      }}
    >
      <div>
        <div className="text-sm font-medium">{label}</div>
        <p className="text-xs text-muted-foreground">{help}</p>
      </div>
      <ol className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="rounded-md border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Question {i + 1}</span>
              <div className="flex gap-1">
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Move question ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7" aria-label={`Remove question ${i + 1}`} disabled={items.length <= 1} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Input aria-label={`Question ${i + 1}`} placeholder="Question" value={item.q} maxLength={questionMax} onChange={(e) => update(i, { q: e.target.value })} />
            <Textarea aria-label={`Answer ${i + 1}`} placeholder="Answer" value={item.a} maxLength={answerMax} rows={3} onChange={(e) => update(i, { a: e.target.value })} />
          </li>
        ))}
      </ol>
      <Button type="button" size="sm" variant="outline" disabled={items.length >= maxItems} onClick={() => setItems((xs) => [...xs, { q: "", a: "" }])}>
        <Plus className="mr-1 h-4 w-4" /> Add a question
      </Button>
      <Footer pending={pending} status={status} isCustom={isCustom} lastChanged={lastChanged} dirty={dirty} onReset={reset} />
    </form>
  );
}
