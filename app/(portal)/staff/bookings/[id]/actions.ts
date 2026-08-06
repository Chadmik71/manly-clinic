"use server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { notifyBookingCancelled } from "@/lib/notify";
import { addMinutes } from "date-fns";
import {
  BOOKING_EARLIEST_START_MIN,
  BOOKING_LATEST_END_MIN,
} from "@/lib/clinic";
import { sydneyDateOf, sydneyLocalToUtc, SYDNEY_TZ } from "@/lib/time";

const ALLOWED = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];

export async function setBookingStatus(
  id: string,
  status: string,
  notifyClient?: boolean,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  )
    return { error: "Forbidden." };
  if (!ALLOWED.includes(status)) return { error: "Invalid status." };

  // Fetch the booking once. Needed for the (optional) cancellation email,
  // and lets us return a clean "Not found." instead of a Prisma error.
  const booking = await db.booking.findUnique({
    where: { id },
    include: { client: { select: { email: true, name: true, phone: true } } },
  });
  if (!booking) return { error: "Not found." };

  // Hard block: a health-fund booking cannot be marked COMPLETED until
  // a real therapist has been assigned for the audit record. Health funds
  // (Medibank/HCF/etc.) need to know which named clinician performed the
  // session — the customer-facing slot label "Therapist 1" is not a
  // valid audit answer. The /staff/bookings/[id] page surfaces this rule
  // in a banner before the staff member tries to set the status.
  if (
    status === "COMPLETED" &&
    booking.claimWithHealthFund &&
    !booking.assignedTherapistId
  ) {
    return {
      error:
        "Health-fund bookings require a therapist assignment before they can be marked COMPLETED. Use the \"Therapist (assigned for clinical record)\" card above to assign someone, then try again.",
    };
  }

  await db.booking.update({
    where: { id },
    data: {
      status,
      ...(status === "CANCELLED" ? { cancelledAt: new Date() } : {}),
    },
  });

  await audit({
    userId: session.user.id,
    action: "UPDATE_BOOKING_STATUS",
    resource: `Booking:${id}`,
    metadata: { status, notifyClient: notifyClient ?? false },
  });

  // Staff-initiated cancellations: send notification email only when staff
  // explicitly opts in via the UI checkbox. Per clinic policy, staff cancels
  // never charge a late-cancel fee (only client self-cancels do), so feeCents
  // is always 0 here.
  if (status === "CANCELLED" && notifyClient) {
    await notifyBookingCancelled({
      email: booking.client.email,
      phone: booking.client.phone,
      name: booking.client.name,
      reference: booking.reference,
      startsAt: booking.startsAt,
      feeCents: 0,
    });
  }

  revalidatePath(`/staff/bookings/${id}`);
  revalidatePath("/staff/bookings");
  revalidatePath("/staff");
  return { ok: true };
}


export interface ClinicalNotesInput {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  areasTreated: string;
  techniques: string;
  outcome: string;
}

/**
 * Save per-visit clinical notes (SOAP + extras) for a booking.
 * Staff/Admin only. Audit-logged. Stamps noteAuthorId + noteUpdatedAt
 * automatically from the current session.
 */
export async function updateBookingNotes(
  id: string,
  notes: ClinicalNotesInput,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  )
    return { error: "Forbidden." };

  const booking = await db.booking.findUnique({ where: { id } });
  if (!booking) return { error: "Not found." };

  // Empty strings stored as NULL so the export view can distinguish
  // "not yet written" from "actively cleared".
  const orNull = (s: string) => (s.trim().length === 0 ? null : s.trim());

  await db.booking.update({
    where: { id },
    data: {
      noteSubjective: orNull(notes.subjective),
      noteObjective: orNull(notes.objective),
      noteAssessment: orNull(notes.assessment),
      notePlan: orNull(notes.plan),
      noteAreasTreated: orNull(notes.areasTreated),
      noteTechniques: orNull(notes.techniques),
      noteOutcome: orNull(notes.outcome),
      noteAuthorId: session.user.id,
      noteUpdatedAt: new Date(),
    },
  });

  await audit({
    userId: session.user.id,
    action: "UPDATE_CLINICAL_NOTES",
    resource: `Booking:${id}`,
    metadata: {
      // Don't log note bodies — only which fields were filled. Keeps the audit
      // trail useful for "did someone write notes" questions without leaking
      // clinical data into the audit table.
      hasSubjective: !!orNull(notes.subjective),
      hasObjective: !!orNull(notes.objective),
      hasAssessment: !!orNull(notes.assessment),
      hasPlan: !!orNull(notes.plan),
      hasAreasTreated: !!orNull(notes.areasTreated),
      hasTechniques: !!orNull(notes.techniques),
      hasOutcome: !!orNull(notes.outcome),
    },
  });

  revalidatePath(`/staff/bookings/${id}`);
  return { ok: true };
}


/**
 * Save (or clear) the staff body-diagram annotation overlay for a booking.
 * Pass null as the data URL to remove the existing annotation. The PNG is
 * size-capped at 500 KB which covers high-DPI 480x440 canvases comfortably.
 */
export async function updateBookingAnnotation(
  bookingId: string,
  dataUrl: string | null,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  )
    return { error: "Forbidden." };

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { id: true },
  });
  if (!booking) return { error: "Booking not found." };

  if (dataUrl !== null) {
    if (!dataUrl.startsWith("data:image/png;base64,"))
      return { error: "Invalid annotation image." };
    if (dataUrl.length > 500_000)
      return { error: "Annotation image is too large." };
  }

  await db.booking.update({
    where: { id: bookingId },
    data: { noteAnnotationsPng: dataUrl },
  });

  await audit({
    userId: session.user.id,
    action: "UPDATE_BOOKING_ANNOTATION",
    resource: `Booking:${bookingId}`,
    metadata: { hasAnnotation: dataUrl !== null },
  });

  revalidatePath(`/staff/bookings/${bookingId}`);
  return { ok: true };
}

/**
 * Assign (or unassign) the real therapist who actually performed the session.
 * This is the AUDIT data set — separate from the customer-facing slot label.
 *
 * The dropdown source is User table where role IN (STAFF, ADMIN). The User's
 * name at assignment time is denormalised into Booking.assignedTherapistName
 * so historical bookings stay frozen even if the User is later renamed.
 *
 * Pass an empty string to unassign. Available for ALL services (not just
 * remedial). Audit-logged.
 */
export async function assignTherapist(
  bookingId: string,
  userId: string,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  )
    return { error: "Forbidden." };

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, assignedTherapistId: true },
  });
  if (!booking) return { error: "Booking not found." };

  let resolvedUser: { id: string; name: string | null } | null = null;
  if (userId.trim().length > 0) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true },
    });
    if (!user) return { error: "User not found." };
    if (user.role !== "STAFF" && user.role !== "ADMIN") {
      return { error: "Only STAFF or ADMIN can be assigned to a session." };
    }
    resolvedUser = { id: user.id, name: user.name };
  }

  if (booking.assignedTherapistId === (resolvedUser?.id ?? null)) {
    return { ok: true };
  }

  await db.booking.update({
    where: { id: bookingId },
    data: {
      assignedTherapistId: resolvedUser?.id ?? null,
      assignedTherapistName: resolvedUser?.name ?? null,
      assignedAt: resolvedUser ? new Date() : null,
      assignedById: resolvedUser ? session.user.id : null,
    },
  });

  await audit({
    userId: session.user.id,
    action: "ASSIGN_THERAPIST",
    resource: `Booking:${bookingId}`,
    metadata: {
      previousAssignedTherapistId: booking.assignedTherapistId,
      newAssignedTherapistId: resolvedUser?.id ?? null,
      newAssignedTherapistName: resolvedUser?.name ?? null,
    },
  });

  revalidatePath(`/staff/bookings/${bookingId}`);
  revalidatePath("/staff/bookings");
  revalidatePath("/staff");
  return { ok: true };
}


// Renders a Date in Sydney calendar time, returning minute-of-day (0..1439).
// Vercel runs in UTC; raw getHours/getMinutes would give UTC values for our
// startsAt/endsAt. This helper formats via Intl with timeZone Australia/Sydney
// so booking-window checks compare apples to apples.
const SYD_HM_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: SYDNEY_TZ,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
function sydneyMinuteOfDay(d: Date): number {
  const parts = SYD_HM_FMT.formatToParts(d);
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

/**
 * Update the core appointment fields: time, therapist (slot/customer-facing),
 * and service variant. Atomic with conflict checking.
 */
export async function updateBookingDetails(
  bookingId: string,
  data: { startsAt: string; therapistId: string; variantId: string },
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  )
    return { error: "Forbidden." };

  const booking = await db.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { error: "Booking not found." };
  if (booking.status === "CANCELLED" || booking.status === "COMPLETED")
    return { error: "Cancelled or completed bookings cannot be edited." };

  const startsAt = sydneyLocalToUtc(data.startsAt);
  if (!startsAt) return { error: "Invalid date/time." };

  const variant = await db.serviceVariant.findUnique({
    where: { id: data.variantId },
  });
  if (!variant) return { error: "Service variant not found." };

  const endsAt = addMinutes(startsAt, variant.durationMin);
  const startMin = sydneyMinuteOfDay(startsAt);
  const endMin = sydneyMinuteOfDay(endsAt);
  const sameDay = sydneyDateOf(startsAt) === sydneyDateOf(endsAt);
  if (
    startMin < BOOKING_EARLIEST_START_MIN ||
    !sameDay ||
    endMin > BOOKING_LATEST_END_MIN
  )
    return { error: "Time falls outside opening hours." };

  const newTherapistId =
    data.therapistId.trim().length === 0 ? null : data.therapistId;

  if (newTherapistId) {
    const conflict = await db.booking.findFirst({
      where: {
        id: { not: bookingId },
        therapistId: newTherapistId,
        status: { in: ["PENDING", "CONFIRMED"] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true },
    });
    if (conflict)
      return { error: "Therapist has another booking at this time." };
    const timeOffHit = await db.timeOff.findFirst({
      where: {
        therapistId: newTherapistId,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { id: true },
    });
    if (timeOffHit)
      return { error: "Therapist is blocked off at this time." };
  }

  await db.booking.update({
    where: { id: bookingId },
    data: {
      startsAt,
      endsAt,
      therapistId: newTherapistId,
      variantId: variant.id,
      serviceId: variant.serviceId,
      priceCentsAtBooking: variant.priceCents,
    },
  });

  await audit({
    userId: session.user.id,
    action: "UPDATE_BOOKING_DETAILS",
    resource: `Booking:${bookingId}`,
    metadata: {
      previousStartsAt: booking.startsAt.toISOString(),
      newStartsAt: startsAt.toISOString(),
      previousVariantId: booking.variantId,
      newVariantId: variant.id,
      previousTherapistId: booking.therapistId,
      newTherapistId,
    },
  });

  revalidatePath(`/staff/bookings/${bookingId}`);
  revalidatePath("/staff/bookings");
  revalidatePath("/staff/schedule");
  return { ok: true };
}

/**
 * Update walk-in client name and phone on the linked User. Email is
 * intentionally not editable here — it’s the User’s @unique identifier.
 */
export async function updateWalkInClientDetails(
  bookingId: string,
  data: { name: string; phone: string },
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  )
    return { error: "Forbidden." };

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { clientId: true, isWalkIn: true },
  });
  if (!booking) return { error: "Booking not found." };
  if (!booking.isWalkIn)
    return {
      error:
        "Only walk-in bookings can have their client details edited here.",
    };

  const name = data.name.trim();
  const phone = data.phone.trim();
  if (name.length === 0) return { error: "Name is required." };

  await db.user.update({
    where: { id: booking.clientId },
    data: { name, phone: phone.length === 0 ? null : phone },
  });

  await audit({
    userId: session.user.id,
    action: "UPDATE_WALKIN_CLIENT",
    resource: `Booking:${bookingId}`,
    metadata: { clientId: booking.clientId },
  });

  revalidatePath(`/staff/bookings/${bookingId}`);
  revalidatePath(`/staff/clients/${booking.clientId}`);
  return { ok: true };
}

/**
 * Update per-booking internal staff notes (Booking.notes). Distinct from
 * clinical SOAP notes (those are handled by updateBookingNotes).
 */
export async function updateBookingInternalNotes(
  bookingId: string,
  notes: string,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  )
    return { error: "Forbidden." };
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { id: true },
  });
  if (!booking) return { error: "Booking not found." };

  const trimmed = notes.trim();
  await db.booking.update({
    where: { id: bookingId },
    data: { notes: trimmed.length === 0 ? null : trimmed },
  });

  await audit({
    userId: session.user.id,
    action: "UPDATE_BOOKING_INTERNAL_NOTES",
    resource: `Booking:${bookingId}`,
    metadata: { hasContent: trimmed.length > 0 },
  });

  revalidatePath(`/staff/bookings/${bookingId}`);
  return { ok: true };
}

const intakeCompletionSchema = z.object({
  claimWithHealthFund: z.string().optional(),
  healthFundName: z.string().max(80).optional(),
  healthFundMemberNumber: z.string().max(40).optional(),
  reasonForTreatment: z.string().max(2000).optional(),
  // PNG data URL from the in-clinic signature pad, same 150 KB ceiling as
  // the new-booking form and the public confirm action.
  signatureDataUrl: z.string().max(150_000).optional(),
  medicalHistory: z.string().max(2000).optional(), // JSON array of condition codes
  medicalConditions: z.string().max(2000).optional(),
  medications: z.string().max(2000).optional(),
  allergies: z.string().max(2000).optional(),
  injuries: z.string().max(2000).optional(),
  painLocationCodes: z.string().max(2000).optional(), // JSON array of body-diagram codes
  painScale: z.string().optional(),
  painOnset: z.string().max(500).optional(),
  painHistory: z.string().max(2000).optional(),
  treatmentGoals: z.string().max(2000).optional(),
  pregnancy: z.string().optional(),
  pregnancyWeeks: z.string().optional(),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactRelationship: z.string().max(80).optional(),
  emergencyContactPhone: z.string().max(40).optional(),
  dob: z.string().optional(),
  gender: z.string().max(40).optional(),
  gpName: z.string().max(120).optional(),
  gpClinic: z.string().max(200).optional(),
  gpPhone: z.string().max(40).optional(),
});

/**
 * Complete the full clinical intake + signature for a booking that was made
 * over the phone (or otherwise created without the customer physically
 * present). Staff open this on the shop PC/tablet once the customer has
 * arrived, fill in the medical questionnaire with them, and capture a fresh
 * drawn signature. Mirrors the full-intake block on the new-booking form.
 *
 * Always records a fresh IntakeForm row (per-visit consent rule) and, when
 * the client is claiming with their health fund, flips
 * Booking.claimWithHealthFund on — this is the actual claim decision point
 * for a booking that was deferred at phone-booking time.
 */
export async function completeBookingIntake(
  bookingId: string,
  fd: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  )
    return { error: "Forbidden." };

  const raw: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string") raw[k] = v;
  });
  const parsed = intakeCompletionSchema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid input." };
  const data = parsed.data;

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { service: true },
  });
  if (!booking) return { error: "Booking not found." };
  if (booking.status === "CANCELLED")
    return { error: "This booking has been cancelled." };

  const claimWithHealthFund = data.claimWithHealthFund === "on";
  const isPregnancyService = booking.service.slug === "pregnancy-massage";
  const isPregnant = data.pregnancy === "on" || isPregnancyService;

  const hasSignature =
    !!data.signatureDataUrl &&
    data.signatureDataUrl.startsWith("data:image/png;base64,");
  if (!hasSignature)
    return { error: "Please ask the client to sign the medical form." };

  const requiredIntake: Array<[string | undefined, string]> = [
    [data.medicalConditions, "medical conditions (write 'none' if none)"],
    [data.medications, "current medications (write 'none' if none)"],
    [data.allergies, "allergies (write 'none' if none)"],
    [data.injuries, "recent injuries / areas to avoid"],
    [data.emergencyContactName, "emergency contact name"],
    [data.emergencyContactPhone, "emergency contact phone"],
  ];
  for (const [val, label] of requiredIntake) {
    if (!val || !val.trim()) {
      return { error: `Please complete the medical form: ${label}.` };
    }
  }
  if (isPregnant) {
    const weeks = data.pregnancyWeeks ? parseInt(data.pregnancyWeeks, 10) : NaN;
    if (!Number.isFinite(weeks) || weeks < 1 || weeks > 45) {
      return { error: "Please enter how many weeks pregnant the client is." };
    }
  }
  if (claimWithHealthFund) {
    if (!booking.service.healthFundEligible)
      return { error: "This treatment is not eligible for health fund rebates." };
    if (!data.healthFundName || !data.healthFundName.trim())
      return { error: "Please choose the client's health fund." };
    if (!data.healthFundMemberNumber || !data.healthFundMemberNumber.trim())
      return { error: "Please enter the client's health fund member number." };
    if (!data.reasonForTreatment || !data.reasonForTreatment.trim())
      return { error: "Please describe the reason for treatment." };
  }

  // Fold the patient demographics staff entered into the client's User
  // record — only the fields actually filled in, never blank out existing data.
  const dobDate =
    data.dob && /^\d{4}-\d{2}-\d{2}$/.test(data.dob) ? new Date(data.dob) : null;
  const userPatch: Record<string, unknown> = {};
  if (dobDate && !isNaN(dobDate.getTime())) userPatch.dob = dobDate;
  if (data.gender) userPatch.gender = data.gender;
  if (data.gpName) userPatch.gpName = data.gpName;
  if (data.gpClinic) userPatch.gpClinic = data.gpClinic;
  if (data.gpPhone) userPatch.gpPhone = data.gpPhone;
  if (Object.keys(userPatch).length > 0) {
    await db.user.update({ where: { id: booking.clientId }, data: userPatch });
  }

  let painScale: number | null = null;
  if (data.painScale) {
    const n = parseInt(data.painScale, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 10) painScale = n;
  }
  const pregnancyWeeks =
    isPregnant && data.pregnancyWeeks
      ? (() => {
          const n = parseInt(data.pregnancyWeeks!, 10);
          return Number.isFinite(n) && n >= 1 && n <= 45 ? n : null;
        })()
      : null;

  await db.intakeForm.create({
    data: {
      userId: booking.clientId,
      medicalHistory: data.medicalHistory ?? null,
      medicalConditions: data.medicalConditions ?? null,
      medications: data.medications ?? null,
      allergies: data.allergies ?? null,
      injuries: data.injuries ?? null,
      painLocationCodes: data.painLocationCodes ?? null,
      painScale,
      painOnset: data.painOnset ?? null,
      painHistory: data.painHistory ?? null,
      treatmentGoals: data.treatmentGoals ?? null,
      pregnancy: isPregnant,
      pregnancyWeeks,
      emergencyContactName: data.emergencyContactName ?? null,
      emergencyContactRelationship: data.emergencyContactRelationship ?? null,
      emergencyContactPhone: data.emergencyContactPhone ?? null,
      healthFundName: claimWithHealthFund ? (data.healthFundName ?? null) : null,
      healthFundMemberNumber: claimWithHealthFund
        ? (data.healthFundMemberNumber ?? null)
        : null,
      reasonForTreatment: claimWithHealthFund
        ? (data.reasonForTreatment ?? null)
        : null,
      consentToTreat: true,
      consentToStore: true,
      signedAt: new Date(),
      signatureDataUrl: data.signatureDataUrl ?? null,
    },
  });

  if (booking.claimWithHealthFund !== claimWithHealthFund) {
    await db.booking.update({
      where: { id: bookingId },
      data: { claimWithHealthFund },
    });
  }

  await audit({
    userId: session.user.id,
    action: "COMPLETE_BOOKING_INTAKE",
    resource: `Booking:${bookingId}`,
    metadata: {
      claimWithHealthFund,
      isPregnant,
      ...(claimWithHealthFund
        ? { healthFundName: data.healthFundName ?? null }
        : {}),
    },
  });

  revalidatePath(`/staff/bookings/${bookingId}`);
  revalidatePath("/staff/bookings");
  return { ok: true };
}
