import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { CLINIC } from "@/lib/clinic";
import { getAvailableSlots } from "@/lib/booking";
import { bookingsNeedingHealthForm } from "@/lib/booking-intake";
import { applyHolidaySurcharge } from "@/lib/holidays";
import { notifyBookingConfirmed, smsConfigured } from "@/lib/notify";
import { normalisePhone } from "@/lib/phone";
import { sydneyDateOf, sydneyLocalToUtc, sydneyTimeShort, sydneyTodayISO } from "@/lib/time";
import { bookingReference } from "@/lib/utils";

// What the phone assistant may do to the calendar: look up free times and
// make a new booking. It can't see, change or cancel existing bookings.

/** How far ahead the assistant may book. */
export const PHONE_BOOKING_MAX_DAYS = 60;
/** Stops a prank or confused call filling the diary. */
export const PHONE_BOOKINGS_PER_CALL = 2;
export const PHONE_BOOKINGS_PER_NUMBER_PER_DAY = 3;
export const PHONE_BOOKINGS_PER_DAY = 30;
export const PHONE_BOOKING_NOTE = "Booked by the phone assistant. Consent and health form still to do on arrival.";

export type PhoneService = {
  slug: string;
  name: string;
  healthFundEligible: boolean;
  description: string | null;
  variants: { durationMin: number; priceCents: number }[];
};

export async function phoneServiceCatalogue(): Promise<PhoneService[]> {
  const services = await db.service.findMany({
    where: { active: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: {
      slug: true,
      name: true,
      healthFundEligible: true,
      description: true,
      variants: { where: { active: true }, orderBy: { durationMin: "asc" }, select: { durationMin: true, priceCents: true } },
    },
  });
  return services.filter((s) => s.variants.length > 0);
}

async function findVariant(serviceSlug: string, durationMin: number) {
  return db.serviceVariant.findFirst({
    where: { durationMin, active: true, service: { slug: serviceSlug, active: true } },
    include: { service: true },
  });
}

function dayOffset(dateISO: string): number {
  const today = Date.parse(`${sydneyTodayISO()}T00:00:00Z`);
  return Math.round((Date.parse(`${dateISO}T00:00:00Z`) - today) / 86400000);
}

export type FindTimesResult =
  | { ok: true; date: string; times: string[]; note?: string }
  | { ok: false; error: string };

/** Free start times ("HH:mm", Sydney) on one day, for one service length. */
export async function findTimes(input: {
  serviceSlug: string;
  durationMin: number;
  date: string;
}): Promise<FindTimesResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "date must be YYYY-MM-DD" };
  const offset = dayOffset(input.date);
  if (offset < 0) return { ok: false, error: "That date is in the past." };
  if (offset > PHONE_BOOKING_MAX_DAYS)
    return { ok: false, error: `Phone bookings can only be made up to ${PHONE_BOOKING_MAX_DAYS} days ahead.` };

  const variant = await findVariant(input.serviceSlug, input.durationMin);
  if (!variant) return { ok: false, error: "That service isn't offered at that length." };

  const slots = await getAvailableSlots({
    date: new Date(`${input.date}T02:00:00Z`),
    durationMin: input.durationMin,
  });
  const times = [...new Set(slots.map((s) => hhmm(s.startsAt)))];
  if (times.length === 0) return { ok: true, date: input.date, times: [], note: "Fully booked that day." };
  return { ok: true, date: input.date, times };
}

function hhmm(d: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Sydney",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export type BookResult =
  | { ok: true; reference: string; summary: string; textSent: boolean }
  | { ok: false; error: string };

export async function bookAppointment(input: {
  callSid: string;
  callerPhone: string | null;
  serviceSlug: string;
  durationMin: number;
  date: string;
  time: string;
  name: string;
  phone: string;
}): Promise<BookResult> {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) return { ok: false, error: "Need the client's name." };
  const phone = normalisePhone(input.phone);
  if (!/^0\d{9}$/.test(phone)) return { ok: false, error: "Need a 10-digit Australian phone number." };

  const startsAt = sydneyLocalToUtc(`${input.date}T${input.time}`);
  if (!startsAt) return { ok: false, error: "date must be YYYY-MM-DD and time HH:mm" };

  const variant = await findVariant(input.serviceSlug, input.durationMin);
  if (!variant) return { ok: false, error: "That service isn't offered at that length." };

  // The model may retry a tool call: the same time and service already booked
  // on this call is that booking. Only this call's bookings are checked, so a
  // caller can't probe anyone else's diary.
  const call = await db.phoneCall.findUnique({ where: { callSid: input.callSid }, select: { bookingRefs: true } });
  const refsOnCall = call?.bookingRefs ? call.bookingRefs.split(",") : [];
  const retried = await db.booking.findFirst({
    where: { reference: { in: refsOnCall }, startsAt, variantId: variant.id },
    select: { reference: true },
  });
  if (retried) return { ok: true, reference: retried.reference, summary: "Already booked on this call.", textSent: false };

  if (refsOnCall.length >= PHONE_BOOKINGS_PER_CALL)
    return { ok: false, error: "Booking limit for one call reached. Take a message for the team instead." };
  const limit = await phoneBookingLimitReached(phone);
  if (limit) return { ok: false, error: `${limit} Take a message for the team instead.` };

  const offset = dayOffset(input.date);
  if (offset < 0 || offset > PHONE_BOOKING_MAX_DAYS)
    return { ok: false, error: `Phone bookings can only be made from today up to ${PHONE_BOOKING_MAX_DAYS} days ahead.` };
  const slot = (
    await getAvailableSlots({ date: new Date(`${input.date}T02:00:00Z`), durationMin: input.durationMin })
  ).find((s) => s.startsAt.getTime() === startsAt.getTime());
  if (!slot) return { ok: false, error: "That time is no longer free. Offer other times from find_times." };

  const client = await findOrCreateClient(name, phone, input.callerPhone);
  const pricing = applyHolidaySurcharge(variant.priceCents, slot.startsAt);

  const reference = bookingReference();
  const booking = await db.booking.create({
    data: {
      reference,
      clientId: client.id,
      serviceId: variant.serviceId,
      variantId: variant.id,
      therapistId: slot.therapistId,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      status: "CONFIRMED",
      priceCentsAtBooking: pricing.finalPriceCents,
      notes: PHONE_BOOKING_NOTE,
    },
  });

  await db.phoneCall.update({
    where: { callSid: input.callSid },
    data: { bookingRefs: call?.bookingRefs ? `${call.bookingRefs},${reference}` : reference },
  });

  await audit({
    userId: null,
    action: "CREATE_BOOKING_PHONE_AI",
    resource: `Booking:${booking.id}`,
    metadata: { reference, callSid: input.callSid, newClient: client.created },
  });

  const needsForm = await bookingsNeedingHealthForm([
    {
      id: booking.id,
      clientId: client.id,
      createdAt: booking.createdAt,
      status: booking.status,
      service: { healthFundEligible: variant.service.healthFundEligible, slug: variant.service.slug },
    },
  ]);
  await notifyBookingConfirmed({
    email: client.email,
    phone,
    name: client.name,
    reference,
    serviceName: variant.service.name,
    durationMin: variant.durationMin,
    startsAt: slot.startsAt,
    healthFormUrl: needsForm.has(booking.id)
      ? `${CLINIC.domain}/portal/bookings/${booking.id}/health-form`
      : undefined,
  });

  const textSent = smsConfigured();
  const day = sydneyDateOf(slot.startsAt) === sydneyTodayISO() ? "today" : input.date;
  return {
    ok: true,
    reference,
    summary: `${variant.service.name}, ${variant.durationMin} min, ${day} at ${sydneyTimeShort(slot.startsAt)}, $${pricing.finalPriceCents / 100}${pricing.holidayName ? ` including the ${pricing.surchargePct}% ${pricing.holidayName} surcharge` : ""}`,
    textSent,
  };
}

/**
 * Bookings only join an existing client record when the caller is ringing
 * from that client's own number and gives the same first name. Anyone else
 * gets a new record (staff can merge duplicates), so a caller can't attach a
 * booking to, or trigger messages for, someone else's account.
 * Phones are stored as typed ("0412 345 678"), so search on the last 3 digits
 * (contiguous in every stored format) and compare normalised.
 */
async function findOrCreateClient(
  name: string,
  phone: string,
  callerPhone: string | null,
): Promise<{ id: string; name: string; email: string; created: boolean }> {
  if (callerPhone && normalisePhone(callerPhone) === phone) {
    const candidates = await db.user.findMany({
      where: { role: "CLIENT", phone: { contains: phone.slice(-3) } },
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { createdAt: "desc" },
    });
    const firstName = name.split(" ")[0].toLowerCase();
    const match = candidates.find(
      (u) => u.phone && normalisePhone(u.phone) === phone && u.name.trim().toLowerCase().split(" ")[0] === firstName,
    );
    if (match) return { id: match.id, name: match.name, email: match.email, created: false };
  }

  const fakeId = Math.random().toString(36).slice(2, 10);
  const created = await db.user.create({
    data: {
      email: `walkin-${fakeId}@clinic.local`,
      name,
      phone,
      passwordHash: await bcrypt.hash(`walkin-${fakeId}-${Date.now()}`, 10),
      role: "CLIENT",
    },
    select: { id: true, name: true, email: true },
  });
  return { ...created, created: true };
}

/** Stops repeat prank calls filling the diary: per phone number per day, and
 *  a clinic-wide daily ceiling. Returns the reason, or null when fine. */
async function phoneBookingLimitReached(phone: string): Promise<string | null> {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const recent = await db.booking.findMany({
    where: { createdAt: { gte: since }, notes: PHONE_BOOKING_NOTE, status: { in: ["PENDING", "CONFIRMED"] } },
    select: { client: { select: { phone: true } } },
  });
  if (recent.length >= PHONE_BOOKINGS_PER_DAY) return "The phone assistant has reached today's booking limit.";
  const forPhone = recent.filter((b) => b.client.phone && normalisePhone(b.client.phone) === phone).length;
  if (forPhone >= PHONE_BOOKINGS_PER_NUMBER_PER_DAY) return "This number already has the most bookings allowed by phone today.";
  return null;
}
