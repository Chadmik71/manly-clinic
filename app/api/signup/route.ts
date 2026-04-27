import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { headers } from "next/headers";

const schema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email().max(254),
  phone: z.string().max(40).optional(),
  password: z.string().min(8).max(200),
  consentPrivacy: z.boolean(),
});

export async function POST(req: Request) {
  const json = await req.json().catch(() => null);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  }
  const { email, password, name, phone, consentPrivacy } = parsed.data;
  if (!consentPrivacy) {
    return NextResponse.json(
      { error: "Privacy policy must be accepted." },
      { status: 400 },
    );
  }
  const existing = await db.user.findUnique({
    where: { email: email.toLowerCase() },
  });
  if (existing) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const ua = h.get("user-agent") ?? null;
  const user = await db.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name,
      phone,
      role: "CLIENT",
      consentRecords: {
        create: {
          type: "PRIVACY_POLICY",
          version: "1.0",
          granted: true,
          ipAddress: ip,
          userAgent: ua,
        },
      },
    },
  });
  await audit({ userId: user.id, action: "SIGNUP" });
  return NextResponse.json({ ok: true });
}
