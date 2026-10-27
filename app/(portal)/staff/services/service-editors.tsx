"use client";

import { useState, useTransition } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { categoryLabel, formatDuration } from "@/lib/utils";
import {
  addService,
  addServiceVariant,
  toggleService,
  toggleServiceVariant,
  updateService,
  updateServicePrice,
  type ServiceActionResult,
} from "./actions";

type Status = null | { kind: "ok"; message: string } | { kind: "error"; message: string };

export type EditableService = {
  id: string;
  name: string;
  description: string;
  category: string;
  active: boolean;
  healthFundEligible: boolean;
  variants: { id: string; durationMin: number; priceCents: number; active: boolean }[];
};

const CATEGORIES = ["RELAXATION", "THERAPEUTIC", "SPECIALTY", "ADD_ON"];
const DURATIONS = Array.from({ length: 12 }, (_, i) => (i + 1) * 15);

function dollars(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** Local draft that resets whenever the saved value from the server changes. */
function useDraft(saved: string): [string, (v: string) => void] {
  const [draft, setDraft] = useState(saved);
  const [seen, setSeen] = useState(saved);
  if (saved !== seen) {
    setSeen(saved);
    setDraft(saved);
  }
  return [draft, setDraft];
}

function useAction() {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>(null);
  function run(action: () => Promise<ServiceActionResult>, okMessage: string, onOk?: () => void) {
    setStatus(null);
    startTransition(async () => {
      const r = await action();
      if (r.ok) {
        setStatus({ kind: "ok", message: okMessage });
        onOk?.();
      } else {
        setStatus({ kind: "error", message: r.error });
      }
    });
  }
  return { pending, status, run };
}

function StatusText({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <span role="status" className={status.kind === "ok" ? "text-xs text-green-700 dark:text-green-400" : "text-xs text-destructive"}>
      {status.message}
    </span>
  );
}

function VariantRow({ variant }: { variant: EditableService["variants"][number] }) {
  const [price, setPrice] = useDraft(dollars(variant.priceCents));
  const { pending, status, run } = useAction();
  const id = `price-${variant.id}`;
  return (
    <li className="flex flex-wrap items-center gap-2 py-2">
      <label htmlFor={id} className={variant.active ? "w-20 text-sm" : "w-20 text-sm text-muted-foreground line-through"}>
        {formatDuration(variant.durationMin)}
      </label>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateServicePrice(variant.id, price), "Price saved.");
        }}
      >
        <span className="text-sm text-muted-foreground">$</span>
        <Input id={id} inputMode="decimal" className="h-8 w-24" value={price} onChange={(e) => setPrice(e.target.value)} />
        <Button type="submit" size="sm" variant="outline" disabled={pending || price === dollars(variant.priceCents)}>
          Save price
        </Button>
      </form>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          run(
            () => toggleServiceVariant(variant.id, !variant.active),
            variant.active ? "Length hidden from the website." : "Length shown on the website.",
          )
        }
      >
        {variant.active ? "Hide" : "Show"}
      </Button>
      {!variant.active && <Badge variant="secondary">hidden</Badge>}
      <StatusText status={status} />
    </li>
  );
}

function AddLengthForm({ serviceId }: { serviceId: string }) {
  const [duration, setDuration] = useState("60");
  const [price, setPrice] = useState("");
  const { pending, status, run } = useAction();
  return (
    <form
      className="flex flex-wrap items-center gap-2 pt-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addServiceVariant(serviceId, duration, price), "Length added.", () => setPrice(""));
      }}
    >
      <span className="text-sm text-muted-foreground">Add a length:</span>
      <select
        aria-label="New length"
        className="h-8 rounded-md border border-input bg-background px-2 text-sm"
        value={duration}
        onChange={(e) => setDuration(e.target.value)}
      >
        {DURATIONS.map((d) => (
          <option key={d} value={d}>
            {formatDuration(d)}
          </option>
        ))}
      </select>
      <span className="text-sm text-muted-foreground">$</span>
      <Input aria-label="New length price" inputMode="decimal" placeholder="Price" className="h-8 w-24" value={price} onChange={(e) => setPrice(e.target.value)} />
      <Button type="submit" size="sm" variant="outline" disabled={pending || !price}>
        Add
      </Button>
      <StatusText status={status} />
    </form>
  );
}

export function ServiceEditor({ service, orderControls }: { service: EditableService; orderControls: React.ReactNode }) {
  const [name, setName] = useDraft(service.name);
  const [description, setDescription] = useDraft(service.description);
  const details = useAction();
  const visibility = useAction();
  const dirty = name !== service.name || description !== service.description;

  return (
    <div className="flex gap-3">
      {orderControls}
      <div className="flex-1 space-y-4 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">{service.name}</h2>
          <Badge variant="outline">{categoryLabel(service.category)}</Badge>
          <Badge variant={service.active ? "success" : "secondary"}>{service.active ? "on website" : "hidden"}</Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={visibility.pending}
            onClick={() =>
              visibility.run(
                () => toggleService(service.id, !service.active),
                service.active ? "Treatment hidden from the website." : "Treatment shown on the website.",
              )
            }
          >
            {service.active ? "Hide treatment" : "Show treatment"}
          </Button>
          <StatusText status={visibility.status} />
        </div>

        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            details.run(() => updateService(service.id, name, description), "Saved.");
          }}
        >
          <div className="space-y-1">
            <Label htmlFor={`name-${service.id}`}>Name</Label>
            <Input id={`name-${service.id}`} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`desc-${service.id}`}>Description</Label>
            <Textarea id={`desc-${service.id}`} rows={3} value={description} maxLength={600} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={details.pending || !dirty}>
              Save name &amp; description
            </Button>
            <StatusText status={details.status} />
          </div>
        </form>

        <div>
          <div className="text-sm font-medium">Lengths &amp; prices</div>
          <ul className="divide-y">
            {service.variants.map((v) => (
              <VariantRow key={v.id} variant={v} />
            ))}
          </ul>
          <AddLengthForm serviceId={service.id} />
        </div>

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Health fund claimable: <strong>{service.healthFundEligible ? "Yes" : "No"}</strong>. Health-fund setting affects
            health forms and claims — ask your developer to change it.
          </span>
        </p>
      </div>
    </div>
  );
}

export function AddServiceForm() {
  const [form, setForm] = useState({ name: "", category: "RELAXATION", description: "", duration: "60", price: "" });
  const { pending, status, run } = useAction();
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addService(form), "Treatment added. It is on the website now.", () =>
          setForm({ name: "", category: "RELAXATION", description: "", duration: "60", price: "" }),
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="new-service-name">Name</Label>
          <Input id="new-service-name" value={form.name} maxLength={80} onChange={set("name")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-service-category">Category</Label>
          <select
            id="new-service-category"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.category}
            onChange={set("category")}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="new-service-desc">Description</Label>
        <Textarea id="new-service-desc" rows={3} value={form.description} maxLength={600} onChange={set("description")} />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="new-service-duration">First length</Label>
          <select
            id="new-service-duration"
            className="flex h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={form.duration}
            onChange={set("duration")}
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {formatDuration(d)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="new-service-price">Price ($)</Label>
          <Input id="new-service-price" inputMode="decimal" className="w-28" value={form.price} onChange={set("price")} />
        </div>
        <Button type="submit" disabled={pending || !form.name || !form.price}>
          Add treatment
        </Button>
      </div>
      <StatusText status={status} />
      <p className="text-xs text-muted-foreground">
        New treatments are not health-fund claimable. Ask your developer if one should be.
      </p>
    </form>
  );
}
