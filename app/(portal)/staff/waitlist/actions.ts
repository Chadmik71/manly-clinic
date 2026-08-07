"use server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";

/**
 * Staff dismiss action — read-only list otherwise. Staff follow up by phone
 * directly (not through the app); this just lets them clear an entry that's
 * been actioned or turned out uncontactable, so the list doesn't accumulate.
 */
export async function removeWaitlistEntry(
  id: string,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  )
    return { error: "Forbidden." };

  await db.waitlistEntry.update({
    where: { id },
    data: { status: "REMOVED" },
  });
  await audit({
    userId: session.user.id,
    action: "REMOVE_WAITLIST_ENTRY",
    resource: `WaitlistEntry:${id}`,
  });
  revalidatePath("/staff/waitlist");
  return { ok: true };
}
