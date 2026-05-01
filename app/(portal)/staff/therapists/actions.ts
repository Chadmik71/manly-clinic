"use server";

import { db } from "@/lib/db";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";

// Pattern for synthetic emails on casual-staff records that don't need login.
// Use the .local TLD (RFC 6762 reserved) so we can never collide with a real
// address. Matches the spirit of guest-checkout `imported-*@...` synthetic
// emails — these are never reachable, never sent to, never used to sign in.
const CASUAL_EMAIL_DOMAIN = "manlyremedialthai.local";

function casualEmail(): string {
  // Use a cuid-like random suffix to avoid collisions when adding many
  // casual staff in bulk.
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `casual-${ts}${rand}@${CASUAL_EMAIL_DOMAIN}`;
}

async function unguessablePlaceholderHash(): Promise<string> {
  // bcrypt of 32 bytes of randomness — never decrypted, never matched.
  const random =
    Math.random().toString(36) +
    Math.random().toString(36) +
    Date.now().toString(36);
  return hash(`casual-no-login-${random}`, 10);
}

export async function addTherapist(formData: FormData) {
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const isCasual = formData.get("isCasual") === "on";

  if (!name) {
    throw new Error("Full name is required.");
  }

  let email: string;
  let passwordHash: string;

  if (isCasual) {
    // Casual staff: synthesize a non-routable email and an unusable password
    // hash. They don't get login access. The Therapist record is fully
    // usable for booking assignment; admin can later "promote" them to a
    // login-capable account by editing email + password from the detail page.
    email = casualEmail();
    passwordHash = await unguessablePlaceholderHash();
  } else {
    const rawEmail = (formData.get("email") as string | null) ?? "";
    const password = (formData.get("password") as string | null) ?? "";
    email = rawEmail.toLowerCase().trim();

    if (!email) throw new Error("Email is required for staff with login.");
    if (!password) throw new Error("Password is required for staff with login.");
    if (password.length < 6)
      throw new Error("Password must be at least 6 characters.");

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) throw new Error("A user with this email already exists.");

    passwordHash = await hash(password, 10);
  }

  // Optional fields — empty strings persist as null so reports/filters can
  // distinguish "not provided" from "intentionally blank".
  const phone = ((formData.get("phone") as string | null) ?? "").trim();
  const bio = ((formData.get("bio") as string | null) ?? "").trim();
  const qualifications = (
    (formData.get("qualifications") as string | null) ?? ""
  ).trim();
  const providerNumber = (
    (formData.get("providerNumber") as string | null) ?? ""
  ).trim();
  const associationName = (
    (formData.get("associationName") as string | null) ?? ""
  ).trim();

  const user = await db.user.create({
    data: {
      name,
      email,
      phone: phone || null,
      role: "STAFF",
      passwordHash,
    },
  });

  await db.therapist.create({
    data: {
      userId: user.id,
      active: true,
      bio: bio || null,
      qualifications: qualifications || null,
      providerNumber: providerNumber || null,
      associationName: associationName || null,
      // Casual staff start with NO availability — admin sets the specific
      // days they actually work (e.g. just one Saturday). Regular staff get
      // the standard Mon-Sat 9am-8:30pm template.
      availability: isCasual
        ? undefined
        : {
            create: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
              dayOfWeek: day,
              startMin: 9 * 60,
              endMin: 20 * 60,
            })),
          },
    },
  });

  revalidatePath("/staff/therapists");
}


/**
 * One-shot bootstrap: create 9 placeholder Therapist records (Therapist 2-10)
 * with synthetic emails, unusable passwords, full Mon-Sun 9am-8pm availability,
 * and displayName matching the slot label. Joy is left untouched (admin sets
 * her displayName to "Therapist 1" via the existing edit UI).
 *
 * Idempotent: refuses if any therapist with displayName "Therapist 2" through
 * "Therapist 10" already exists. Admin-only. Audit-logged.
 *
 * After running this once, the customer-facing booking flow will offer 10
 * anonymous slots. Admin can dial down by toggling individual therapists
 * inactive on /staff/therapists/[id].
 */
export async function seedPlaceholderTherapists(): Promise<{
  ok?: boolean;
  error?: string;
  created?: number;
}> {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return { error: "Forbidden — admin only." };
  }

  // Idempotency check: any existing placeholder?
  const existing = await db.therapist.findFirst({
    where: {
      displayName: {
        in: ["Therapist 2", "Therapist 3", "Therapist 4", "Therapist 5", "Therapist 6", "Therapist 7", "Therapist 8", "Therapist 9", "Therapist 10"],
      },
    },
    select: { id: true, displayName: true },
  });
  if (existing) {
    return {
      error: `Already seeded — found ${existing.displayName}. Refusing to create duplicates.`,
    };
  }

  let created = 0;
  for (let i = 2; i <= 10; i++) {
    const label = `Therapist ${i}`;
    const email = casualEmail();
    const passwordHash = await unguessablePlaceholderHash();

    const user = await db.user.create({
      data: {
        name: label,
        email,
        role: "STAFF",
        passwordHash,
      },
    });

    await db.therapist.create({
      data: {
        userId: user.id,
        active: true,
        displayName: label,
        // Standard Mon-Sun 9am-8pm so the slot is always bookable within
        // clinic hours. Admin can edit/restrict per slot via the existing
        // availability UI.
        availability: {
          create: [0, 1, 2, 3, 4, 5, 6].map((day) => ({
            dayOfWeek: day,
            startMin: 9 * 60,
            endMin: 20 * 60,
          })),
        },
      },
    });
    created++;
  }

  await audit({
    userId: session.user.id,
    action: "SEED_PLACEHOLDER_THERAPISTS",
    resource: "Therapist:bulk",
    metadata: { created },
  });

  revalidatePath("/staff/therapists");
  return { ok: true, created };
}
