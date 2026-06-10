import { db } from "@/lib/db";

// Clinic-wide feature settings.
//
// Singleton row at ClinicSetting where id = "default". Created lazily on
// first read so we do not depend on a seed step. All callers should use
// getClinicSettings() rather than touching db.clinicSetting directly.
//
// The shape returned here is a plain TypeScript object - safe to pass to
// client components when needed. updatedBy is omitted from the public type
// because the settings UI can fetch it separately if it needs the audit info.

export type ClinicSettings = {
  depositsEnabled: boolean;
  cardSurchargeEnabled: boolean;
  cardSurchargeBps: number;
  reviewRequestEnabled: boolean;
};

export const CLINIC_SETTINGS_DEFAULTS: ClinicSettings = {
  depositsEnabled: true,
  cardSurchargeEnabled: false,
  cardSurchargeBps: 150,
  reviewRequestEnabled: false,
};

/**
 * Read the singleton settings row. Creates it with defaults on first call.
 *
 * Throws a Prisma error if the database is unreachable - callers should
 * decide whether to fall back to defaults or surface the error.
 */
export async function getClinicSettings(): Promise<ClinicSettings> {
  const row = await db.clinicSetting.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", ...CLINIC_SETTINGS_DEFAULTS },
    select: {
      depositsEnabled: true,
      cardSurchargeEnabled: true,
      cardSurchargeBps: true,
      reviewRequestEnabled: true,
    },
  });
  return row;
}

/**
 * Compute a surcharge amount in cents on a base amount, given the current
 * settings. Returns 0 if surcharge is disabled. Rounds to the nearest cent.
 *
 * basis points: 150 = 1.50%, 200 = 2.00%, etc.
 */
export function computeCardSurchargeCents(
  baseCents: number,
  settings: Pick<ClinicSettings, "cardSurchargeEnabled" | "cardSurchargeBps">,
): number {
  if (!settings.cardSurchargeEnabled) return 0;
  if (baseCents <= 0) return 0;
  // bps / 10000 = percentage as a fraction. Round to nearest cent.
  return Math.round((baseCents * settings.cardSurchargeBps) / 10000);
}

/**
 * Convenience wrapper: returns a "safe" version that falls back to defaults
 * if the DB read fails. Suitable for non-critical paths (e.g. the customer
 * deposit-card UI where we would rather render something than crash).
 *
 * For payment routes you should call getClinicSettings() directly and let
 * errors propagate so we never charge the wrong amount.
 */
export async function getClinicSettingsSafe(): Promise<ClinicSettings> {
  try {
    return await getClinicSettings();
  } catch (err) {
    console.error("[clinic-settings] DB read failed, using defaults", err);
    return { ...CLINIC_SETTINGS_DEFAULTS };
  }
}
