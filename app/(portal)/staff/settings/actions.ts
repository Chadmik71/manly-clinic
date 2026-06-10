"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { CLINIC_SETTINGS_DEFAULTS } from "@/lib/clinic-settings";

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
