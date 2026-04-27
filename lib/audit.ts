import { db } from "@/lib/db";
import { headers } from "next/headers";

export async function audit(params: {
  userId?: string | null;
  action: string;
  resource?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    const h = await headers();
    const ipAddress =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? null;
    const userAgent = h.get("user-agent") ?? null;
    await db.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        resource: params.resource,
        ipAddress,
        userAgent,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch {
    // never let audit failures break the request
  }
}
