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
): Promise<{ ok?: boolean; error?: string }> {
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
  if (cents > 100000)
    return { error: "Maximum voucher amount is $1,000." };

  // Generate unique code (retry on collision). The code is held in the
  // database but is NOT revealed to the recipient until staff activate
  // the voucher after payment is confirmed in clinic.
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
      // Voucher is reserved but inert until staff confirm in-clinic
      // payment and switch the status to ACTIVE.
      status: "PENDING_PAYMENT",
    },
  });

  await audit({
    userId: session?.user?.id ?? null,
    action: "PURCHASE_VOUCHER",
    resource: `Voucher:${v.id}`,
    metadata: {
      amountCents: cents,
      recipient: parsed.data.recipientEmail,
      status: "PENDING_PAYMENT",
    },
  });

  // Email a "reservation received" notice. We deliberately do NOT include
  // the redemption code at this stage — staff issue the code via a
  // separate activation email once payment is confirmed.
  const apiKey = process.env.RESEND_API_KEY;
  const subject = `Your $${(cents / 100).toFixed(0)} voucher is reserved`;
  const html = `<p>Hi ${parsed.data.recipientName},</p>
    <p>A <strong>$${(cents / 100).toFixed(2)}</strong> gift voucher to ${CLINIC.name} has been reserved for you.</p>
    ${parsed.data.message ? `<p>From the sender: <em>${parsed.data.message}</em></p>` : ""}
    <p>The voucher will be activated and your redemption code emailed once payment is confirmed in clinic. Please pop in within <strong>7 days</strong> of purchase to settle payment, otherwise the reservation will lapse.</p>
    <p>Once activated the voucher is valid for 12 months and can be redeemed at <a href="${CLINIC.domain}/book">${CLINIC.domain}/book</a>.</p>`;
  if (apiKey) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from:
            process.env.EMAIL_FROM ??
            `bookings@${CLINIC.domain.replace(/^https?:\/\//, "")}`,
          to: parsed.data.recipientEmail,
          subject,
          html,
        }),
      });
    } catch (e) {
      console.error("[voucher email]", e);
    }
  } else {
    console.log("[voucher email:stub]", {
      to: parsed.data.recipientEmail,
      status: "PENDING_PAYMENT",
    });
  }

  return { ok: true };
}
