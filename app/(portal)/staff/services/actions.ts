"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { z } from "zod";
import { formatDuration } from "@/lib/utils";

/**
 * Move a service one position up or down in the customer-facing display order.
 *
 * Strategy: read every service in current display order, swap the target with
 * its neighbour, then rewrite displayOrder = position (0..n-1) for all rows in
 * one transaction. Rewriting the whole sequence (n is small) keeps values
 * distinct and self-heals any duplicate/legacy 0 values, so a plain
 * value-swap edge case can't wedge the ordering.
 *
 * Admin-only — re-checked here, not just hidden in the UI.
 */
export async function moveService(formData: FormData): Promise<void> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return;

  const id = String(formData.get("id") ?? "");
  const dir = String(formData.get("dir") ?? "");
  if (!id || (dir !== "up" && dir !== "down")) return;

  const ordered = await db.service.findMany({
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  const ids = ordered.map((s) => s.id);

  const idx = ids.indexOf(id);
  if (idx === -1) return;
  const swapIdx = dir === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= ids.length) return; // already at the edge

  [ids[idx], ids[swapIdx]] = [ids[swapIdx], ids[idx]];

  await db.$transaction(
    ids.map((sid, position) =>
      db.service.update({ where: { id: sid }, data: { displayOrder: position } }),
    ),
  );

  await audit({
    userId: session.user.id,
    action: "REORDER_SERVICE",
    resource: `Service:${id}`,
    metadata: { dir, from: idx, to: swapIdx },
  });

  // Refresh the staff list and every customer-facing surface that reads order.
  revalidatePath("/staff/services");
  revalidatePath("/");
  revalidatePath("/services");
  revalidatePath("/book");
}

export type ServiceActionResult = { ok: true } | { ok: false; error: string };

const MAX_PRICE_CENTS = 200_000;
const SERVICE_CATEGORIES = ["RELAXATION", "THERAPEUTIC", "SPECIALTY", "ADD_ON"] as const;

async function requireAdmin() {
  const session = await auth();
  return session?.user?.role === "ADMIN" ? session.user : null;
}

/** "$95", "95" or "95.50" -> cents. Null when it isn't a sensible price. */
function parsePriceCents(raw: unknown): number | null {
  const s = String(raw ?? "").replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return cents > 0 && cents <= MAX_PRICE_CENTS ? cents : null;
}
const PRICE_ERROR = "Enter a price between $1 and $2,000, e.g. 95 or 95.50.";

function parseDuration(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 15 && n <= 180 && n % 15 === 0 ? n : null;
}
const DURATION_ERROR = "Length must be 15 to 180 minutes, in steps of 15.";

const serviceText = z.object({
  name: z.string().trim().min(2, "Name is too short.").max(80, "Name is too long (80 characters max)."),
  description: z.string().trim().max(600, "Description is too long (600 characters max)."),
});

function refreshCatalogue() {
  revalidatePath("/", "layout");
}

export async function updateServicePrice(variantId: string, price: string): Promise<ServiceActionResult> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Only an admin can change prices." };
  const priceCents = parsePriceCents(price);
  if (priceCents === null) return { ok: false, error: PRICE_ERROR };

  const variant = await db.serviceVariant.findUnique({
    where: { id: String(variantId) },
    select: { id: true, priceCents: true, durationMin: true, service: { select: { name: true } } },
  });
  if (!variant) return { ok: false, error: "That length no longer exists." };
  if (variant.priceCents === priceCents) return { ok: true };

  await db.serviceVariant.update({ where: { id: variant.id }, data: { priceCents } });
  await audit({
    userId: user.id,
    action: "UPDATE_SERVICE_PRICE",
    resource: `ServiceVariant:${variant.id}`,
    metadata: {
      service: variant.service.name,
      durationMin: variant.durationMin,
      oldPriceCents: variant.priceCents,
      newPriceCents: priceCents,
    },
  });
  refreshCatalogue();
  return { ok: true };
}

export async function addServiceVariant(
  serviceId: string,
  duration: string,
  price: string,
): Promise<ServiceActionResult> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Only an admin can add lengths." };
  const durationMin = parseDuration(duration);
  if (durationMin === null) return { ok: false, error: DURATION_ERROR };
  const priceCents = parsePriceCents(price);
  if (priceCents === null) return { ok: false, error: PRICE_ERROR };

  const service = await db.service.findUnique({
    where: { id: String(serviceId) },
    select: { id: true, name: true, variants: { where: { durationMin } } },
  });
  if (!service) return { ok: false, error: "That treatment no longer exists." };

  // Lengths are never deleted (bookings point at them), so re-adding a hidden
  // one switches it back on rather than creating a duplicate.
  const existing = service.variants[0];
  if (existing?.active) {
    return { ok: false, error: `${service.name} already has a ${formatDuration(durationMin)} length.` };
  }
  const variant = existing
    ? await db.serviceVariant.update({ where: { id: existing.id }, data: { active: true, priceCents } })
    : await db.serviceVariant.create({ data: { serviceId: service.id, durationMin, priceCents } });

  await audit({
    userId: user.id,
    action: "ADD_SERVICE_VARIANT",
    resource: `ServiceVariant:${variant.id}`,
    metadata: {
      service: service.name,
      durationMin,
      priceCents,
      reactivated: !!existing,
      ...(existing ? { oldPriceCents: existing.priceCents } : {}),
    },
  });
  refreshCatalogue();
  return { ok: true };
}

export async function toggleServiceVariant(variantId: string, active: boolean): Promise<ServiceActionResult> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Only an admin can hide or show lengths." };

  const result = await db.$transaction(async (tx) => {
    const variant = await tx.serviceVariant.findUnique({
      where: { id: String(variantId) },
      select: {
        id: true,
        active: true,
        durationMin: true,
        serviceId: true,
        service: { select: { name: true, active: true } },
      },
    });
    if (!variant) return { ok: false as const, error: "That length no longer exists." };
    if (variant.active === active) return { ok: true as const, changed: null };
    if (!active && variant.service.active) {
      const others = await tx.serviceVariant.count({
        where: { serviceId: variant.serviceId, active: true, id: { not: variant.id } },
      });
      if (others === 0) {
        return {
          ok: false as const,
          error: `This is the only length left for ${variant.service.name}. Add another length first, or hide the whole treatment.`,
        };
      }
    }
    await tx.serviceVariant.update({ where: { id: variant.id }, data: { active } });
    return { ok: true as const, changed: variant };
  });
  if (!result.ok) return result;
  if (!result.changed) return { ok: true };

  await audit({
    userId: user.id,
    action: "TOGGLE_SERVICE_VARIANT",
    resource: `ServiceVariant:${result.changed.id}`,
    metadata: {
      service: result.changed.service.name,
      durationMin: result.changed.durationMin,
      oldActive: !active,
      newActive: active,
    },
  });
  refreshCatalogue();
  return { ok: true };
}

export async function updateService(
  serviceId: string,
  name: string,
  description: string,
): Promise<ServiceActionResult> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Only an admin can edit treatments." };
  const parsed = serviceText.safeParse({ name, description });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const service = await db.service.findUnique({
    where: { id: String(serviceId) },
    select: { id: true, name: true, description: true },
  });
  if (!service) return { ok: false, error: "That treatment no longer exists." };
  const next = { name: parsed.data.name, description: parsed.data.description || null };
  if (next.name === service.name && next.description === service.description) return { ok: true };

  await db.service.update({ where: { id: service.id }, data: next });
  await audit({
    userId: user.id,
    action: "UPDATE_SERVICE",
    resource: `Service:${service.id}`,
    metadata: { old: { name: service.name, description: service.description }, new: next },
  });
  refreshCatalogue();
  return { ok: true };
}

export async function toggleService(serviceId: string, active: boolean): Promise<ServiceActionResult> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Only an admin can hide or show treatments." };

  const service = await db.service.findUnique({
    where: { id: String(serviceId) },
    select: { id: true, name: true, active: true, _count: { select: { variants: { where: { active: true } } } } },
  });
  if (!service) return { ok: false, error: "That treatment no longer exists." };
  if (service.active === active) return { ok: true };
  if (active && service._count.variants === 0) {
    return { ok: false, error: `Show at least one length of ${service.name} before showing the treatment.` };
  }

  await db.service.update({ where: { id: service.id }, data: { active } });
  await audit({
    userId: user.id,
    action: "TOGGLE_SERVICE",
    resource: `Service:${service.id}`,
    metadata: { service: service.name, oldActive: service.active, newActive: active },
  });
  refreshCatalogue();
  return { ok: true };
}

function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || "treatment";
}

export async function addService(input: {
  name: string;
  category: string;
  description: string;
  duration: string;
  price: string;
}): Promise<ServiceActionResult> {
  const user = await requireAdmin();
  if (!user) return { ok: false, error: "Only an admin can add treatments." };
  const parsed = serviceText.safeParse({ name: input?.name, description: input?.description ?? "" });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const category = SERVICE_CATEGORIES.find((c) => c === input.category);
  if (!category) return { ok: false, error: "Pick a category." };
  const durationMin = parseDuration(input.duration);
  if (durationMin === null) return { ok: false, error: DURATION_ERROR };
  const priceCents = parsePriceCents(input.price);
  if (priceCents === null) return { ok: false, error: PRICE_ERROR };

  const base = slugify(parsed.data.name);
  const taken = new Set(
    (await db.service.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } })).map((s) => s.slug),
  );
  let slug = base;
  for (let n = 2; taken.has(slug); n++) slug = `${base}-${n}`;

  const last = await db.service.findFirst({ orderBy: { displayOrder: "desc" }, select: { displayOrder: true } });
  const service = await db.service.create({
    data: {
      slug,
      name: parsed.data.name,
      category,
      description: parsed.data.description || null,
      healthFundEligible: false,
      displayOrder: (last?.displayOrder ?? 0) + 1,
      variants: { create: { durationMin, priceCents } },
    },
  });

  await audit({
    userId: user.id,
    action: "ADD_SERVICE",
    resource: `Service:${service.id}`,
    metadata: { new: { name: service.name, slug, category, description: service.description, durationMin, priceCents } },
  });
  refreshCatalogue();
  return { ok: true };
}
