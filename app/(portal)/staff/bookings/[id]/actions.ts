"use server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { notifyBookingCancelled } from "@/lib/notify";

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
