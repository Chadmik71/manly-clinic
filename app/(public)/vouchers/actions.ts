"use server";
import { z } from "zod";
import { addMonths } from "date-fns";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { generateVoucherCode } from "@/lib/voucher";
import { CLINIC } from "@/lib/clinic";

const schema = z.object({
  amountCents: z.string().min(1),
  recipientName: z.string().min(1).max(120),
  recipientEmail: z.string().email().max(254),
  message: z.string().max(500).optional(),
});

export async function purchaseVoucher(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string; code?: string }> {
  const session = await auth();
  const raw: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string") raw[k] = v;
  });
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid input." };
  const cents = parseInt(parsed.data.amountCents, 10);
  if (!Number.isFinite(cents) || cents < 2000)
    return { error: "Minimum voucher amount is $20." };
  if (cents > 100000) return { error: "Maximum voucher amount is $1,000." };

  // Generate unique code (retry on collision)
  let code = generateVoucherCode();
  for (let i = 0; i < 5; i++) {
    const existing = await db.voucher.findUnique({ where: { code } });
    if (!existing) break;
    code = generateVoucherCode();
  }

  const v = await db.voucher.create({
    data: {
      code,
      amountCents: cents,
      balanceCents: cents,
      purchaserId: session?.user?.id ?? null,
      recipientName: parsed.data.recipientName,
      recipientEmail: parsed.data.recipientEmail.toLowerCase(),
      message: parsed.data.message || null,
      expiresAt: addMonths(new Date(), 12),
      status: "ACTIVE",
    },
  });

  await audit({
    userId: session?.user?.id ?? null,
    action: "PURCHASE_VOUCHER",
    resource: `Voucher:${v.id}`,
    metadata: { amountCents: cents, recipient: parsed.data.recipientEmail },
  });

  // Email the recipient (best-effort)
  const apiKey = process.env.RESEND_API_KEY;
  const subject = `You've received a $${(cents / 100).toFixed(0)} gift voucher`;
  const html = `<p>Hi ${parsed.data.recipientName},</p>
<p>You&apos;ve received a <strong>$${(cents / 100).toFixed(2)}</strong> gift voucher to ${CLINIC.name}.</p>
<p>Your code: <strong style="font-family:monospace;font-size:18px">${code}</strong></p>
${parsed.data.message ? `<p>From the sender: <em>${parsed.data.message}</em></p>` : ""}
<p>Redeem at <a href="${CLINIC.domain}/book">${CLINIC.domain}/book</a> by entering the code at booking confirmation. Valid for 12 months.</p>`;
  if (apiKey) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM ?? `bookings@${CLINIC.domain.replace(/^https?:\/\//, "")}`,
          to: parsed.data.recipientEmail,
          subject,
          html,
        }),
      });
    } catch (e) {
      console.error("[voucher email]", e);
    }
  } else {
    console.log("[voucher email:stub]", { to: parsed.data.recipientEmail, code });
  }

  return { ok: true, code };
}
