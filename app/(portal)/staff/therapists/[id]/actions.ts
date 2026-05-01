"use server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

async function requireStaff() {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "STAFF" && session.user.role !== "ADMIN")
  )
    return null;
  return session;
}

const profileSchema = z.object({
  id: z.string().min(1),
  // What customers see (e.g. "Therapist 1"). Empty string -> null on save.
  displayName: z.string().max(80).optional(),
  bio: z.string().max(2000).optional(),
  qualifications: z.string().max(500).optional(),
  providerNumber: z.string().max(80).optional(),
  associationName: z.string().max(40).optional(),
  active: z.string().optional(),
});

export async function saveProfile(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireStaff();
  if (!session) return { error: "Forbidden." };
  const raw: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string") raw[k] = v;
  });
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid input." };
  await db.therapist.update({
    where: { id: parsed.data.id },
    data: {
      displayName: parsed.data.displayName?.trim() || null,
      bio: parsed.data.bio || null,
      qualifications: parsed.data.qualifications || null,
      providerNumber: parsed.data.providerNumber || null,
      associationName: parsed.data.associationName || null,
      active: parsed.data.active === "on",
    },
  });
  await audit({
    userId: session.user.id,
    action: "UPDATE_THERAPIST_PROFILE",
    resource: `Therapist:${parsed.data.id}`,
  });
  revalidatePath(`/staff/therapists/${parsed.data.id}`);
  revalidatePath("/staff/therapists");
  return { ok: true };
}

export async function saveAvailability(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireStaff();
  if (!session) return { error: "Forbidden." };
  const therapistId = String(fd.get("therapistId") ?? "");
  if (!therapistId) return { error: "Missing therapist id." };
  const slots = fd.getAll("slots").map((v) => String(v));
  // each slot string: "dayOfWeek|startMin|endMin"
  const parsed = slots
    .map((s) => s.split("|").map(Number))
    .filter(([d, st, en]) => Number.isFinite(d) && Number.isFinite(st) && Number.isFinite(en));
  for (const [, st, en] of parsed) {
    if (st >= en) return { error: "End time must be after start time." };
    if (st < 0 || en > 24 * 60) return { error: "Hours must be within a day." };
  }
  await db.$transaction([
    db.availability.deleteMany({ where: { therapistId } }),
    db.availability.createMany({
      data: parsed.map(([dayOfWeek, startMin, endMin]) => ({
        therapistId,
        dayOfWeek,
        startMin,
        endMin,
      })),
    }),
  ]);
  await audit({
    userId: session.user.id,
    action: "UPDATE_THERAPIST_AVAILABILITY",
    resource: `Therapist:${therapistId}`,
  });
  revalidatePath(`/staff/therapists/${therapistId}`);
  revalidatePath("/staff/schedule");
  return { ok: true };
}

const timeoffSchema = z.object({
  therapistId: z.string().min(1),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export async function addTimeOff(
  fd: FormData,
): Promise<{ ok?: boolean; error?: string }> {
  const session = await requireStaff();
  if (!session) return { error: "Forbidden." };
  const raw: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string") raw[k] = v;
  });
  const parsed = timeoffSchema.safeParse(raw);
  if (!parsed.success) return { error: "Invalid input." };
  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(parsed.data.endsAt);
  if (
    isNaN(startsAt.getTime()) ||
    isNaN(endsAt.getTime()) ||
    startsAt >= endsAt
  )
    return { error: "End must be after start." };
  await db.timeOff.create({
    data: {
      therapistId: parsed.data.therapistId,
      startsAt,
      endsAt,
      reason: parsed.data.reason || null,
    },
  });
  await audit({
    userId: session.user.id,
    action: "ADD_TIME_OFF",
    resource: `Therapist:${parsed.data.therapistId}`,
    metadata: { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
  });
  revalidatePath(`/staff/therapists/${parsed.data.therapistId}`);
  return { ok: true };
}

export async function removeTimeOff(fd: FormData) {
  const session = await requireStaff();
  if (!session) return;
  const id = String(fd.get("id") ?? "");
  const therapistId = String(fd.get("therapistId") ?? "");
  if (!id) return;
  await db.timeOff.delete({ where: { id } });
  await audit({
    userId: session.user.id,
    action: "REMOVE_TIME_OFF",
    resource: `TimeOff:${id}`,
  });
  revalidatePath(`/staff/therapists/${therapistId}`);
  redirect(`/staff/therapists/${therapistId}`);
}
