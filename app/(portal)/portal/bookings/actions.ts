"use server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import {
  CANCEL_FEE_THRESHOLD_HOURS,
  CANCEL_FEE_PERCENT,
} from "@/lib/clinic";
import { notifyBookingCancelled } from "@/lib/notify";

export async function cancelBooking(
  id: string,
): Promise<{ ok?: boolean; error?: string; feeCents?: number }> {
  const session = await auth();
  if (!session?.user) return { error: "Sign in required." };
  const b = await db.booking.findUnique({
    where: { id },
    include: { client: { select: { email: true, name: true, phone: true } } },
  });
  if (!b || b.clientId !== session.user.id) return { error: "Not found." };
  if (b.status === "CANCELLED") return { ok: true };

  const hoursUntil = (b.startsAt.getTime() - Date.now()) / 36e5;
  const feeCents =
    hoursUntil < CANCEL_FEE_THRESHOLD_HOURS
      ? Math.round((b.priceCentsAtBooking * CANCEL_FEE_PERCENT) / 100)
      : 0;

  await db.booking.update({
    where: { id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationFeeCents: feeCents,
    },
  });
  await audit({
    userId: session.user.id,
    action: "CANCEL_BOOKING",
    resource: `Booking:${id}`,
    metadata: { feeCents, hoursUntil: Math.round(hoursUntil) },
  });
  await notifyBookingCancelled({
    email: b.client.email,
    phone: b.client.phone,
    name: b.client.name,
    reference: b.reference,
    startsAt: b.startsAt,
    feeCents,
  });
  revalidatePath("/portal/bookings");
  revalidatePath("/portal");
  return { ok: true, feeCents };
}
