"use server";
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
import { sydneyLocalToUtc } from "@/lib/time";
import { z } from "zod";

const ALLOWED = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW"];

/**
 * Edit a booking from the staff portal. Single action handles all five
 * common edit cases atomically:
 *   1. Reschedule (startsAt change)
 *   2. Service / variant change (recomputes price + endsAt from variant.durationMin)
 *   3. Slot change (e.g. "Therapist 1" → "Therapist 2")
 *   4. Walk-in client details (name / phone / email — only if client.isWalkIn)
 *   5. Internal staff notes (Booking.notes)
 *
 * Conflict checking: if a slot is assigned, rejects if another non-cancelled
 * booking overlaps the new window on that slot. Does NOT enforce the 9 AM –
 * 8 PM clinic window or therapist availability — staff overrides those when
 * needed (e.g. running over for a paying client). Does NOT touch the audit-
 * side assignedTherapist (use the existing assignTherapist action for that).
 */
const updateBookingSchema = z.object({
  bookingId: z.string().min(1),
  serviceId: z.string().min(1),
  variantId: z.string().min(1),
  startsAt: z.string().min(1),
  slotId: z.string().optional(),
  notes: z.string().max(2000).optional(),
  walkInName: z.string().max(120).optional(),
  walkInPhone: z.string().max(40).optional(),
  walkInEmail: z.string().max(120).optional(),
});

export async function updateBooking(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  )
    return { error: "Forbidden." };
  const raw: Record<string, string> = {};
  fd.forEach((val, key) => {
    if (typeof val === "string") raw[key] = val;
  });
  const parsed = updateBookingSchema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid input." };

  const booking = await db.booking.findUnique({
    where: { id: parsed.data.bookingId },
    include: { client: { select: { id: true, isWalkIn: true } } },
  });
  if (!booking) return { error: "Booking not found." };

  // Resolve variant to compute duration + price + verify it belongs to the chosen service.
  const variant = await db.serviceVariant.findUnique({
    where: { id: parsed.data.variantId },
    select: {
      id: true,
      durationMin: true,
      priceCents: true,
      serviceId: true,
    },
  });
  if (!variant || variant.serviceId !== parsed.data.serviceId)
    return { error: "Invalid service / duration combination." };

  // Parse the datetime-local string as Sydney wall time (server is UTC on Vercel).
  const startsAt = sydneyLocalToUtc(parsed.data.startsAt);
  if (!startsAt || isNaN(startsAt.getTime()))
    return { error: "Invalid start time." };
  const endsAt = new Date(
    startsAt.getTime() + variant.durationMin * 60 * 1000,
  );

  // Resolve slot (empty string → unassigned).
  let slotId: string | null = null;
  let slotLabel: string | null = null;
  const slotInput = parsed.data.slotId?.trim() ?? "";
  if (slotInput) {
    const slot = await db.slot.findUnique({
      where: { id: slotInput },
      select: { id: true, label: true },
    });
    if (!slot) return { error: "Slot not found." };
    slotId = slot.id;
    slotLabel = slot.label;
  }

  // Slot-level conflict check (only when a slot is set).
  if (slotId) {
    const conflict = await db.booking.findFirst({
      where: {
        id: { not: parsed.data.bookingId },
        slotId,
        status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { reference: true },
    });
    if (conflict)
      return {
        error: `That window already overlaps booking ${conflict.reference} on the same slot. Pick a different time or slot.`,
      };
  }

  // Walk-in client details.
  const wantsWalkInUpdate =
    booking.client.isWalkIn &&
    (parsed.data.walkInName !== undefined ||
      parsed.data.walkInPhone !== undefined ||
      parsed.data.walkInEmail !== undefined);
  if (wantsWalkInUpdate) {
    const data: { name?: string; phone?: string | null; email?: string } =
      {};
    if (parsed.data.walkInName && parsed.data.walkInName.trim().length > 0)
      data.name = parsed.data.walkInName.trim();
    if (parsed.data.walkInPhone !== undefined)
      data.phone = parsed.data.walkInPhone.trim() || null;
    if (parsed.data.walkInEmail && parsed.data.walkInEmail.trim().length > 0)
      data.email = parsed.data.walkInEmail.trim().toLowerCase();
    if (Object.keys(data).length > 0) {
      try {
        await db.user.update({
          where: { id: booking.client.id },
          data,
        });
      } catch {
        return { error: "Could not update walk-in details (email may already be in use)." };
      }
    }
  }

  await db.booking.update({
    where: { id: parsed.data.bookingId },
    data: {
      serviceId: parsed.data.serviceId,
      variantId: parsed.data.variantId,
      startsAt,
      endsAt,
      priceCentsAtBooking: variant.priceCents,
      slotId,
      slotLabel,
      notes: parsed.data.notes?.trim() || null,
    },
  });

  await audit({
    userId: session.user.id,
    action: "UPDATE_BOOKING",
    resource: `Booking:${parsed.data.bookingId}`,
    metadata: {
      previousStartsAt: booking.startsAt.toISOString(),
      newStartsAt: startsAt.toISOString(),
      previousVariantId: booking.variantId,
      newVariantId: parsed.data.variantId,
      previousSlotId: booking.slotId,
      newSlotId: slotId,
      walkInUpdated: wantsWalkInUpdate,
    },
  });

  revalidatePath(`/staff/bookings/${parsed.data.bookingId}`);
  revalidatePath("/staff/bookings");
  revalidatePath("/staff/schedule");
  return { ok: true };
}

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
 *
 * - startsAt is a "YYYY-MM-DDTHH:mm" Sydney wall-clock string from a
 *   datetime-local input. Parsed via sydneyLocalToUtc so storage is correct.
 * - therapistId may be empty string for unassigned.
 * - variantId may match the existing variant (no service/duration change) or a
 *   different variant (changes durationMin, priceCentsAtBooking, and serviceId).
 *
 * Cancelled or completed bookings are blocked. Conflict and TimeOff checks
 * mirror the customer-facing reschedule action.
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
 * Update walk-in client details (name / phone) on the Booking’s linked User.
 * Only meaningful when booking.isWalkIn === true — the form should hide for
 * online clients with their own portal accounts.
 *
 * Email is intentionally NOT editable here — it’s the User’s @unique
 * identifier and changing it could collide with another walk-in (or a real
 * client). If staff need to fix an email, that’s a different operation.
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
 * Update the per-booking internal/admin notes (Booking.notes). This is the
 * free-text field shown to staff only — separate from per-visit clinical
 * notes (SOAP, handled by updateBookingNotes elsewhere).
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
