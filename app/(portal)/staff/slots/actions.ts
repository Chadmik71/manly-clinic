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
