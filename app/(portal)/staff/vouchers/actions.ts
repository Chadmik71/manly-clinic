"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { addMonths } from "date-fns";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { generateVoucherCode } from "@/lib/voucher";

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
