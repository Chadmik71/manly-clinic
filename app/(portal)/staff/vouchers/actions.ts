"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { addMonths } from "date-fns";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { generateVoucherCode } from "@/lib/voucher";
import { notifyVoucherIssued } from "@/lib/notify";

const WalkinSchema = z.object({
  amountCents: z.coerce.number().int().min(500).max(100000),
  recipientName: z.string().trim().min(1).max(100),
  recipientEmail: z.string().trim().toLowerCase().email().max(200),
  message: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function createWalkinVoucher(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  if (session.user.role !== "STAFF" && session.user.role !== "ADMIN") {
    throw new Error("Forbidden");
  }

  const parsed = WalkinSchema.safeParse({
    amountCents: formData.get("amountCents"),
    recipientName: formData.get("recipientName"),
    recipientEmail: formData.get("recipientEmail"),
    message: formData.get("message") || "",
  });
  if (!parsed.success) {
    throw new Error(
      "Invalid input: " +
        parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
    );
  }

  const { amountCents, recipientName, recipientEmail, message } = parsed.data;

  // Generate a unique code; retry on collision (expected to be rare)
  let code: string | null = null;
  for (let i = 0; i < 10; i++) {
    const candidate = generateVoucherCode();
    const existing = await db.voucher.findUnique({ where: { code: candidate } });
    if (!existing) {
      code = candidate;
      break;
    }
  }
  if (!code) {
    throw new Error("Could not generate a unique voucher code; please try again.");
  }

  const voucher = await db.voucher.create({
    data: {
      code,
      amountCents,
      balanceCents: amountCents,
      paidCents: amountCents,
      // Walk-in customers are not Users in our system; the staff member who
      // created the voucher is tracked via the audit log instead.
      purchaserId: null,
      recipientName,
      recipientEmail,
      message: message || null,
      status: "ACTIVE",
      expiresAt: addMonths(new Date(), 12),
    },
  });

  await audit({
    userId: session.user.id,
    action: "voucher.walkin.create",
    resource: `Voucher:${voucher.id}`,
    metadata: {
      amountCents,
      recipientName,
      recipientEmail,
      createdByStaffId: session.user.id,
    },
  });

  revalidatePath("/staff/vouchers");
  redirect(`/staff/vouchers/${voucher.id}?new=1`);
}

export async function emailWalkinVoucher(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  if (session.user.role !== "STAFF" && session.user.role !== "ADMIN") {
    throw new Error("Forbidden");
  }

  const voucherId = String(formData.get("voucherId") || "").trim();
  if (!voucherId) throw new Error("Missing voucherId");

  const voucher = await db.voucher.findUnique({ where: { id: voucherId } });
  if (!voucher) throw new Error("Voucher not found");

  await notifyVoucherIssued({
    code: voucher.code,
    amountCents: voucher.amountCents,
    recipientName: voucher.recipientName,
    recipientEmail: voucher.recipientEmail,
    message: voucher.message,
    expiresAt: voucher.expiresAt,
  });

  await audit({
    userId: session.user.id,
    action: "voucher.email.send",
    resource: `Voucher:${voucher.id}`,
    metadata: {
      recipientEmail: voucher.recipientEmail,
      sentByStaffId: session.user.id,
    },
  });

  revalidatePath(`/staff/vouchers/${voucherId}`);
  redirect(`/staff/vouchers/${voucherId}?emailed=1`);
}

const RedeemSchema = z.object({
  voucherId: z.string().min(1),
  amountDollars: z.coerce.number().min(0.01).max(10000),
  note: z.string().trim().max(200).optional().or(z.literal("")),
});

export async function redeemVoucher(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  if (session.user.role !== "STAFF" && session.user.role !== "ADMIN") {
    throw new Error("Forbidden");
  }

  const parsed = RedeemSchema.safeParse({
    voucherId: formData.get("voucherId"),
    amountDollars: formData.get("amountDollars"),
    note: formData.get("note") || "",
  });
  if (!parsed.success) {
    throw new Error(
      "Invalid input: " +
        parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
    );
  }

  const { voucherId, amountDollars, note } = parsed.data;
  const amountCents = Math.round(amountDollars * 100);

  const voucher = await db.voucher.findUnique({ where: { id: voucherId } });
  if (!voucher) throw new Error("Voucher not found");

  if (voucher.status !== "ACTIVE") {
    throw new Error(`Cannot redeem voucher with status ${voucher.status}`);
  }
  if (voucher.expiresAt && voucher.expiresAt < new Date()) {
    throw new Error("Voucher has expired");
  }
  if (amountCents > voucher.balanceCents) {
    throw new Error(
      `Amount $${(amountCents / 100).toFixed(2)} exceeds remaining balance $${(voucher.balanceCents / 100).toFixed(2)}`,
    );
  }

  const newBalance = voucher.balanceCents - amountCents;
  const newStatus = newBalance === 0 ? "REDEEMED" : "ACTIVE";

  await db.voucher.update({
    where: { id: voucherId },
    data: {
      balanceCents: newBalance,
      status: newStatus,
    },
  });

  await audit({
    userId: session.user.id,
    action: "voucher.redeem",
    resource: `Voucher:${voucherId}`,
    metadata: {
      amountRedeemedCents: amountCents,
      newBalanceCents: newBalance,
      newStatus,
      note: note || undefined,
      staffId: session.user.id,
    },
  });

  revalidatePath(`/staff/vouchers/${voucherId}`);
  revalidatePath("/staff/vouchers");
  redirect(`/staff/vouchers/${voucherId}?redeemed=1`);
}
