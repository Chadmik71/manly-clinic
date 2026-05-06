"use server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { z } from "zod";

async function requireStaff() {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  )
    return null;
  return session;
}

const labelSchema = z
  .string()
  .trim()
  .min(1, "Label required.")
  .max(80, "Label too long.");

/**
 * Idempotent: ensures the four default slots exist if the table is empty.
 * Called by the slots admin page on first visit so admins never see a blank
 * state. Safe to call repeatedly — does nothing once any slot exists.
 */
export async function seedDefaultSlotsIfEmpty(): Promise<void> {
  const session = await requireStaff();
  if (!session) return;

  const count = await db.slot.count();
  if (count > 0) return;

  await db.slot.createMany({
    data: [
      { label: "Therapist 1", displayOrder: 1, active: true },
      { label: "Therapist 2", displayOrder: 2, active: true },
      { label: "Therapist 3", displayOrder: 3, active: true },
      { label: "Therapist 4", displayOrder: 4, active: true },
    ],
  });

  await audit({
    userId: session.user.id,
    action: "SEED_DEFAULT_SLOTS",
    resource: "Slot",
    metadata: { count: 4 },
  });
}

export async function createSlot(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireStaff();
  if (!session) return { error: "Forbidden." };

  const parsed = labelSchema.safeParse(fd.get("label"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const label = parsed.data;

  const existing = await db.slot.findUnique({ where: { label } });
  if (existing) return { error: "A slot with that label already exists." };

  // Append to end: displayOrder = max + 1
  const last = await db.slot.findFirst({
    orderBy: { displayOrder: "desc" },
    select: { displayOrder: true },
  });
  const nextOrder = (last?.displayOrder ?? 0) + 1;

  const created = await db.slot.create({
    data: { label, displayOrder: nextOrder, active: true },
  });

  await audit({
    userId: session.user.id,
    action: "CREATE_SLOT",
    resource: `Slot:${created.id}`,
    metadata: { label, displayOrder: nextOrder },
  });

  revalidatePath("/staff/slots");
  return { ok: true };
}

export async function renameSlot(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireStaff();
  if (!session) return { error: "Forbidden." };

  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "Missing id." };

  const parsed = labelSchema.safeParse(fd.get("label"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const label = parsed.data;

  const existing = await db.slot.findUnique({ where: { label } });
  if (existing && existing.id !== id) {
    return { error: "Another slot already uses that label." };
  }

  await db.slot.update({ where: { id }, data: { label } });

  await audit({
    userId: session.user.id,
    action: "RENAME_SLOT",
    resource: `Slot:${id}`,
    metadata: { label },
  });

  revalidatePath("/staff/slots");
  return { ok: true };
}

export async function toggleSlotActive(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireStaff();
  if (!session) return { error: "Forbidden." };

  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "Missing id." };

  const slot = await db.slot.findUnique({ where: { id } });
  if (!slot) return { error: "Slot not found." };

  await db.slot.update({
    where: { id },
    data: { active: !slot.active },
  });

  await audit({
    userId: session.user.id,
    action: "TOGGLE_SLOT_ACTIVE",
    resource: `Slot:${id}`,
    metadata: { label: slot.label, active: !slot.active },
  });

  revalidatePath("/staff/slots");
  return { ok: true };
}

export async function deleteSlot(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireStaff();
  if (!session) return { error: "Forbidden." };

  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "Missing id." };

  // Refuse to delete a slot that has bookings (would orphan their slotId).
  // Suggest deactivating instead.
  const bookingCount = await db.booking.count({ where: { slotId: id } });
  if (bookingCount > 0) {
    return {
      error: `Cannot delete: ${bookingCount} booking(s) reference this slot. Deactivate instead.`,
    };
  }

  const slot = await db.slot.findUnique({ where: { id } });
  if (!slot) return { error: "Slot not found." };

  await db.slot.delete({ where: { id } });

  await audit({
    userId: session.user.id,
    action: "DELETE_SLOT",
    resource: `Slot:${id}`,
    metadata: { label: slot.label },
  });

  revalidatePath("/staff/slots");
  return { ok: true };
}

/**
 * Per-day capacity overrides — let admins reduce the number of active
 * slots on a specific date (e.g. when a therapist is sick). The booking flow
 * (app/(public)/book/confirm/actions.ts) consults this table when picking a
 * slot for a new booking.
 */
const overrideSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format."),
  maxActiveSlots: z
    .coerce.number()
    .int("Capacity must be a whole number.")
    .min(0, "Capacity must be 0 or higher.")
    .max(50, "Capacity too high."),
  reason: z.string().trim().max(200, "Reason too long.").optional(),
});

export async function setCapacityOverride(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireStaff();
  if (!session) return { error: "Forbidden." };
  const parsed = overrideSchema.safeParse({
    date: fd.get("date"),
    maxActiveSlots: fd.get("maxActiveSlots"),
    reason: fd.get("reason") || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { date, maxActiveSlots, reason } = parsed.data;

  await db.dailyCapacityOverride.upsert({
    where: { date },
    create: {
      date,
      maxActiveSlots,
      reason: reason ?? null,
      createdBy: session.user.id,
    },
    update: {
      maxActiveSlots,
      reason: reason ?? null,
      createdBy: session.user.id,
    },
  });

  await audit({
    userId: session.user.id,
    action: "SET_CAPACITY_OVERRIDE",
    resource: `DailyCapacityOverride:${date}`,
    metadata: { date, maxActiveSlots, reason: reason ?? null },
  });
  revalidatePath("/staff/slots");
  return { ok: true };
}

export async function deleteCapacityOverride(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireStaff();
  if (!session) return { error: "Forbidden." };
  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "Missing id." };
  const ov = await db.dailyCapacityOverride.findUnique({ where: { id } });
  if (!ov) return { error: "Override not found." };
  await db.dailyCapacityOverride.delete({ where: { id } });
  await audit({
    userId: session.user.id,
    action: "DELETE_CAPACITY_OVERRIDE",
    resource: `DailyCapacityOverride:${id}`,
    metadata: { date: ov.date, maxActiveSlots: ov.maxActiveSlots },
  });
  revalidatePath("/staff/slots");
  return { ok: true };
}
