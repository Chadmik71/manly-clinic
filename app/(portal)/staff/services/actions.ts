"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

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
