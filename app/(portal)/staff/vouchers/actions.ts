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

  // Auto-send the voucher email so staff doesn't need a separate click.
  // If sending fails, log it but don't roll back — the voucher exists and staff
  // can retry from the detail page using the "Email to recipient" button.
  let emailSent = false;
  try {
    await notifyVoucherIssued({
      code: voucher.code,
      amountCents: voucher.amountCents,
      recipientName: voucher.recipientName,
      recipientEmail: voucher.recipientEmail,
      message: voucher.message,
      expiresAt: voucher.expiresAt,
    });
    emailSent = true;
  } catch (err) {
    console.error("createWalkinVoucher: email send failed", err);
  }

  await audit({
    userId: session.user.id,
    action: "voucher.walkin.create",
    resource: `Voucher:${voucher.id}`,
    metadata: {
      amountCents,
      recipientName,
      recipientEmail,
      createdByStaffId: session.user.id,
      emailSentToRecipient: emailSent,
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

const ActivateSchema = z.object({
  voucherId: z.string().min(1),
});

export async function activateVoucher(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("Not authenticated");
  if (session.user.role !== "STAFF" && session.user.role !== "ADMIN") {
    throw new Error("Forbidden");
  }

  const parsed = ActivateSchema.safeParse({
    voucherId: formData.get("voucherId"),
  });
  if (!parsed.success) throw new Error("Invalid input");

  const { voucherId } = parsed.data;
  const voucher = await db.voucher.findUnique({ where: { id: voucherId } });
  if (!voucher) throw new Error("Voucher not found");

  // Only PENDING_PAYMENT can be activated. Re-clicking the button on an
  // already-active voucher is a no-op, not an error — keeps the UI tolerant
  // of double-clicks and stale tabs.
  if (voucher.status === "ACTIVE") {
    redirect(`/staff/vouchers/${voucherId}?activated=1`);
  }
  if (voucher.status !== "PENDING_PAYMENT") {
    throw new Error(
      `Cannot activate voucher with status ${voucher.status} — only PENDING_PAYMENT can be activated.`,
    );
  }

  await db.voucher.update({
    where: { id: voucherId },
    data: {
      status: "ACTIVE",
      // Reservation didn't carry a paidCents amount (online payment isn't wired
      // yet — see app/(public)/vouchers/form.tsx). Now that the in-clinic
      // payment is settled, mark the full face value as paid so the audit
      // trail and any future revenue reports stay accurate.
      paidCents: voucher.amountCents,
    },
  });

  // Send the redemption-code email now that the voucher is live. Failure to
  // send shouldn't roll back activation — staff can resend from the "Email
  // to recipient" button on the detail page.
  let emailSent = false;
  try {
    await notifyVoucherIssued({
      code: voucher.code,
      amountCents: voucher.amountCents,
      recipientName: voucher.recipientName,
      recipientEmail: voucher.recipientEmail,
      message: voucher.message,
      expiresAt: voucher.expiresAt,
    });
    emailSent = true;
  } catch (err) {
    console.error("activateVoucher: email send failed", err);
  }

  await audit({
    userId: session.user.id,
    action: "voucher.activate",
    resource: `Voucher:${voucherId}`,
    metadata: {
      previousStatus: "PENDING_PAYMENT",
      newStatus: "ACTIVE",
      amountCents: voucher.amountCents,
      emailSentToRecipient: emailSent,
      staffId: session.user.id,
    },
  });

  revalidatePath(`/staff/vouchers/${voucherId}`);
  revalidatePath("/staff/vouchers");
  redirect(`/staff/vouchers/${voucherId}?activated=1`);
}

const RedeemSchema = z.object({
  voucherId: z.string().min(1),
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
    note: formData.get("note") || "",
  });
  if (!parsed.success) {
    throw new Error(
      "Invalid input: " +
        parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
    );
  }

  const { voucherId, note } = parsed.data;

  const voucher = await db.voucher.findUnique({ where: { id: voucherId } });
  if (!voucher) throw new Error("Voucher not found");

  if (voucher.status !== "ACTIVE") {
    throw new Error(`Cannot redeem voucher with status ${voucher.status}`);
  }
  if (voucher.expiresAt && voucher.expiresAt < new Date()) {
    throw new Error("Voucher has expired");
  }

  // Single-use only: always fully redeem.
  const redeemedAmountCents = voucher.balanceCents;

  await db.voucher.update({
    where: { id: voucherId },
    data: {
      balanceCents: 0,
      status: "REDEEMED",
    },
  });

  await audit({
    userId: session.user.id,
    action: "voucher.redeem",
    resource: `Voucher:${voucherId}`,
    metadata: {
      amountRedeemedCents: redeemedAmountCents,
      newStatus: "REDEEMED",
      note: note || undefined,
      staffId: session.user.id,
    },
  });

  revalidatePath(`/staff/vouchers/${voucherId}`);
  revalidatePath("/staff/vouchers");
  redirect(`/staff/vouchers/${voucherId}?redeemed=1`);
}
