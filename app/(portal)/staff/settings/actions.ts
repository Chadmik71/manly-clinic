"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { CLINIC_SETTINGS_DEFAULTS } from "@/lib/clinic-settings";
import { normalisePhone, isAuMobile } from "@/lib/phone";
import { notifyReviewRequest } from "@/lib/notify";
import { audit } from "@/lib/audit";

/**
 * Send a one-off sample of the post-visit review SMS to a chosen number, so an
 * admin can preview it on a real handset. ADMIN-only. Uses the same Twilio
 * path as the live cron, so it only actually sends when Twilio is configured
 * (i.e. in production).
 */
export async function sendTestReviewSms(
  phoneRaw: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return { ok: false, error: "Forbidden." };
  }
  const phone = normalisePhone(phoneRaw);
  if (!isAuMobile(phone)) {
    return { ok: false, error: "Enter a valid Australian mobile, e.g. 0433 273 377." };
  }
  try {
    await notifyReviewRequest({ phone, name: session.user.name ?? "there" });
    await audit({
      userId: session.user.id,
      action: "TEST_REVIEW_SMS_SENT",
      resource: phone,
    });
    return { ok: true };
  } catch (err) {
    console.error("[sendTestReviewSms] send failed", err);
    return { ok: false, error: "Failed to send. Check Twilio settings / server logs." };
  }
}

// Server action wired by app/staff/settings/settings-form.tsx.
//
// Updates the singleton ClinicSetting row. Clinic settings drive
// payment-critical paths (deposit amount, card surcharge), so the role
// gate is ADMIN-only and enforced inline as defense-in-depth — the
// /staff layout would catch a CLIENT, but a non-admin STAFF user can
// reach this action via a direct POST without it.

export type UpdateSettingsInput = {
  depositsEnabled: boolean;
  cardSurchargeEnabled: boolean;
  cardSurchargeBps: number;
  reviewRequestEnabled: boolean;
};

export type UpdateSettingsResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateClinicSettings(
  input: UpdateSettingsInput,
): Promise<UpdateSettingsResult> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return { ok: false, error: "Forbidden." };
  }

  const { depositsEnabled, cardSurchargeEnabled, cardSurchargeBps, reviewRequestEnabled } =
    input;

  // Validate bps. ACCC requires surcharges to roughly match the merchant
  // cost of acceptance (Stripe AU domestic is ~1.7%), so we cap at 5%.
  if (
    typeof cardSurchargeBps !== "number" ||
    !Number.isInteger(cardSurchargeBps) ||
    cardSurchargeBps < 0 ||
    cardSurchargeBps > 500
  ) {
    return {
      ok: false,
      error: "Surcharge basis points must be a whole number between 0 and 500.",
    };
  }

  try {
    await db.clinicSetting.upsert({
      where: { id: "default" },
      update: {
        depositsEnabled: Boolean(depositsEnabled),
        cardSurchargeEnabled: Boolean(cardSurchargeEnabled),
        cardSurchargeBps,
        reviewRequestEnabled: Boolean(reviewRequestEnabled),
      },
      create: {
        id: "default",
        ...CLINIC_SETTINGS_DEFAULTS,
        depositsEnabled: Boolean(depositsEnabled),
        cardSurchargeEnabled: Boolean(cardSurchargeEnabled),
        cardSurchargeBps,
        reviewRequestEnabled: Boolean(reviewRequestEnabled),
      },
    });
    revalidatePath("/staff/settings");
    return { ok: true };
  } catch (err) {
    console.error("[updateClinicSettings] DB write failed", err);
    return { ok: false, error: "Failed to save settings. See server logs." };
  }
}
