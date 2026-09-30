"use server";

import { redirect } from "next/navigation";
import { confirmBookingByClient, verifyBookingConfirmToken } from "@/lib/booking-confirm";

/** "Yes, I'm coming" button on the reminder-email landing page. */
export async function confirmFromEmail(token: string): Promise<void> {
  const id = verifyBookingConfirmToken(token);
  if (!id) redirect(`/confirm-booking/${encodeURIComponent(token)}`);
  await confirmBookingByClient(id, "EMAIL");
  redirect(`/confirm-booking/${encodeURIComponent(token)}?done=1`);
}
