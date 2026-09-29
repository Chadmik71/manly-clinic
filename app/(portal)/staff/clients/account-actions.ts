"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { CLINIC } from "@/lib/clinic";
import { notifyPortalInvite } from "@/lib/notify";
import { isPlaceholderEmail } from "@/lib/placeholder-email";
import { signResetToken } from "@/lib/reset-token";

// Online-account helpers for clients whose record was created for them
// (phone booking, walk-in, old-system import). Staff add the client's real
// email while the client is in front of them, then send an invite to set a
// password. Emails are deliberately NOT attached automatically from online
// bookings: matching on phone number alone would let anyone who knows a
// client's number take over their record, health information included.

const INVITE_EXPIRY_HOURS = 72;

async function requireStaff() {
  const session = await auth();
  if (!session?.user || (session.user.role !== "STAFF" && session.user.role !== "ADMIN")) {
    return null;
  }
  return session.user;
}

function revalidateClient(clientId: string) {
  revalidatePath(`/staff/clients/${clientId}`);
  revalidatePath("/staff/bookings/[id]", "page");
}

/**
 * Replace a client's placeholder email with their real one. Only allowed
 * while the record still has a placeholder: changing a real email would
 * move the account to a new address, which needs a proper identity check.
 */
export async function setClientEmail(
  clientId: string,
  rawEmail: string,
): Promise<{ ok?: boolean; error?: string }> {
  const user = await requireStaff();
  if (!user) return { error: "Forbidden." };

  const parsed = z.string().trim().toLowerCase().email().max(254).safeParse(rawEmail);
  if (!parsed.success) return { error: "Please enter a valid email address." };
  const email = parsed.data;
  if (isPlaceholderEmail(email)) return { error: "Please enter the client's real email address." };

  const client = await db.user.findUnique({
    where: { id: clientId },
    select: { id: true, email: true, role: true },
  });
  if (!client || client.role !== "CLIENT") return { error: "Client not found." };
  if (!isPlaceholderEmail(client.email)) {
    return {
      error:
        "This client already has an email on file. If it's wrong, ask them to use \"Forgot password\" with the address they can access, or contact the admin.",
    };
  }

  const taken = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (taken) {
    return {
      error:
        "Another client record already uses this email, so this may be a duplicate record. Check the client list before changing it.",
    };
  }

  await db.user.update({ where: { id: clientId }, data: { email } });
  await audit({
    userId: user.id,
    action: "SET_CLIENT_EMAIL",
    resource: `User:${clientId}`,
    metadata: { replacedPlaceholder: true },
  });
  revalidateClient(clientId);
  return { ok: true };
}

/** Email the client a single-use link to choose a password for the portal. */
export async function sendPortalInvite(
  clientId: string,
): Promise<{ ok?: boolean; error?: string; sentTo?: string }> {
  const user = await requireStaff();
  if (!user) return { error: "Forbidden." };

  const client = await db.user.findUnique({
    where: { id: clientId },
    select: { id: true, email: true, name: true, role: true, passwordHash: true },
  });
  if (!client || client.role !== "CLIENT") return { error: "Client not found." };
  if (isPlaceholderEmail(client.email)) {
    return { error: "Add the client's email address first." };
  }

  const token = signResetToken(client.id, client.passwordHash, INVITE_EXPIRY_HOURS * 60 * 60);
  const link = `${CLINIC.domain}/reset-password?token=${encodeURIComponent(token)}`;
  await notifyPortalInvite({
    email: client.email,
    name: client.name || "there",
    link,
    expiresHours: INVITE_EXPIRY_HOURS,
  });
  await audit({
    userId: user.id,
    action: "SEND_PORTAL_INVITE",
    resource: `User:${client.id}`,
  });
  return { ok: true, sentTo: client.email };
}
