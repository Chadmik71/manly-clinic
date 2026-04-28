"use server";

import { db } from "@/lib/db";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";

// Synthetic email pattern for casual staff. Recognisable so we never confuse
// it with a real address, and unique-per-row so the User.email @unique
// constraint is satisfied. The corresponding password hash is an
// unguessable bcrypt placeholder — these accounts cannot sign in.
function casualSyntheticEmail(): string {
  const slug = Math.random().toString(36).slice(2, 10);
  return `casual-${slug}-${Date.now()}@no-login.manlyremedialthai.local`;
}

const CASUAL_PASSWORD_PLACEHOLDER =
  "$2b$10$CASUALSTAFF_NO_LOGIN_PLACEHOLDER_HASH_DO_NOT_USE_XX";

export async function addTherapist(formData: FormData) {
  const session = await auth();
  if (!session?.user || (session.user.role !== "STAFF" && session.user.role !== "ADMIN")) {
    throw new Error("Unauthorised.");
  }

  const isCasual = formData.get("isCasual") === "on";

  const name = ((formData.get("name") as string) || "").trim();
  const phone = ((formData.get("phone") as string) || "").trim();
  const bio = ((formData.get("bio") as string) || "").trim();
  const qualifications = ((formData.get("qualifications") as string) || "").trim();
  const providerNumber = ((formData.get("providerNumber") as string) || "").trim();
  const associationName = ((formData.get("associationName") as string) || "").trim();

  if (!name) throw new Error("Name is required.");

  let email: string;
  let passwordHash: string;

  if (isCasual) {
    // Casual staff: name is the only required field. We synthesise an email
    // so the User row satisfies the @unique constraint, and use an
    // unguessable bcrypt placeholder so nobody can sign in to this account.
    email = casualSyntheticEmail();
    passwordHash = CASUAL_PASSWORD_PLACEHOLDER;
  } else {
    // Salaried/regular staff: still need real email + password to access
    // the staff portal.
    const emailRaw = ((formData.get("email") as string) || "").toLowerCase().trim();
    const password = (formData.get("password") as string) || "";

    if (!emailRaw) throw new Error("Email is required for staff with login.");
    if (!password || password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw)) {
      throw new Error("Please enter a valid email address.");
    }

    const existing = await db.user.findUnique({ where: { email: emailRaw } });
    if (existing) throw new Error("A user with this email already exists.");

    email = emailRaw;
    passwordHash = await hash(password, 10);
  }

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
      // Default Mon–Sat 9am–8:30pm availability for staff with login.
      // Casual staff get NO default availability — they're expected to be
      // assigned specific shifts when they're rostered.
      availability: isCasual
        ? undefined
        : {
            create: [1, 2, 3, 4, 5, 6].map((day) => ({
              dayOfWeek: day,
              startMin: 9 * 60,
              endMin: 20 * 60 + 30,
            })),
          },
    },
  });

  await audit({
    userId: session.user.id,
    action: "STAFF_ADD_THERAPIST",
    resource: `User:${user.id}`,
    metadata: { isCasual, name },
  });

  revalidatePath("/staff/therapists");
}
