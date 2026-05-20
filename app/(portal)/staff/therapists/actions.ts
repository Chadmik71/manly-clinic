"use server";

import { auth } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";

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
  // Creating a new STAFF User is admin-only. This action was previously
  // unauthenticated — any caller (signed-in or not) could mint a STAFF
  // account via direct POST. The /staff/therapists page redirects non-
  // admins, but actions are reachable independent of the route guard.
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    throw new Error("Forbidden.");
  }

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const isCasual = formData.get("isCasual") === "on";

  if (!name) {
    throw new Error("Full name is required.");
  }

  // Role is only meaningful for login-capable accounts. Casual users get a
  // synthetic non-routable email and can't sign in, so their role is fixed
  // to STAFF — the value just controls audit/data shape, not access.
  let role: "STAFF" | "ADMIN" = "STAFF";
  if (!isCasual) {
    const submittedRole = (formData.get("role") as string | null) ?? "STAFF";
    if (submittedRole !== "STAFF" && submittedRole !== "ADMIN") {
      throw new Error("Role must be STAFF or ADMIN.");
    }
    role = submittedRole;
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
      role,
      passwordHash,
    },
  });

  const therapist = await db.therapist.create({
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

  await audit({
    userId: session.user.id,
    action: "ADD_THERAPIST",
    resource: `Therapist:${therapist.id}`,
    metadata: { name, role, isCasual, hasLogin: !isCasual },
  });

  revalidatePath("/staff/therapists");
}

