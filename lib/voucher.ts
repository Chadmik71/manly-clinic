// Voucher helpers: code generation + redemption logic.
import { db } from "@/lib/db";

export function generateVoucherCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "GV-";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  s += "-";
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function findRedeemableVoucher(
  code: string,
): Promise<{
  ok: true;
  voucher: { id: string; code: string; balanceCents: number };
} | { ok: false; error: string }> {
  if (!code) return { ok: false, error: "Enter a voucher code." };
  const v = await db.voucher.findUnique({ where: { code: code.toUpperCase().trim() } });
  if (!v) return { ok: false, error: "Voucher not found." };
  if (v.status !== "ACTIVE")
    return { ok: false, error: `Voucher is ${v.status.toLowerCase()}.` };
  if (v.expiresAt && v.expiresAt < new Date())
    return { ok: false, error: "Voucher has expired." };
  if (v.balanceCents <= 0)
    return { ok: false, error: "Voucher has no remaining balance." };
  return {
    ok: true,
    voucher: { id: v.id, code: v.code, balanceCents: v.balanceCents },
  };
}
