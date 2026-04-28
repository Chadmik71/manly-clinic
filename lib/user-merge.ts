// Customer lookup-or-create for guest checkout.
//
// Goal: never create a duplicate customer when the same person books a
// second time. Imports populated User.email but ~30% of imported records
// got synthetic emails (`imported-<id>@manlyremedialthai.com.au`) because
// we didn't have a real one on file. For those, phone-matching is the
// only way to recognise them when they book.
//
// Strategy:
//  1. Email match (unique) — strongest signal.
//  2. Phone match — only if exactly one user has that phone (non-unique
//     column means we can have collisions, in which case we prefer to
//     create a new record rather than risk linking the wrong person).
//  3. If we matched by phone and the stored email is synthetic (imported
//     placeholder), upgrade it to the guest's real email — this lights
//     up forgot-password for them later.
//  4. No match → create a new user with an unguessable placeholder hash;
//     they'll set a real password via forgot-password if they ever want
//     to log in.

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const SYNTHETIC_EMAIL_RE = /^imported-.*@manlyremedialthai\.com\.au$/i;

export type MergeResult = {
  userId: string;
  isNew: boolean;
  matchedBy: "email" | "phone" | null;
  upgradedEmail: boolean;
};

export async function findOrCreateUserForGuest(input: {
  name: string;
  email: string;
  /** Already-normalised AU phone (e.g. "0412345678"), or empty string. */
  phone: string;
}): Promise<MergeResult> {
  const emailLower = input.email.toLowerCase().trim();
  const phone = input.phone.trim();
  const name = input.name.trim();

  // 1. Email match (User.email is @unique).
  let user = await db.user.findUnique({ where: { email: emailLower } });
  let matchedBy: "email" | "phone" | null = user ? "email" : null;

  // 2. Phone match — only commit to it if there's exactly one record.
  if (!user && phone) {
    const phoneMatches = await db.user.findMany({
      where: { phone },
      orderBy: { createdAt: "asc" },
      take: 2,
    });
    if (phoneMatches.length === 1) {
      user = phoneMatches[0];
      matchedBy = "phone";
    }
    // If 2+, skip merge — ambiguous. We'll create a new record below.
  }

  if (user) {
    // 3. Patch missing fields. Never overwrite real data the user already has;
    //    do replace synthetic email when we matched by phone.
    const patch: Record<string, unknown> = {};
    if (!user.phone && phone) patch.phone = phone;
    if (!user.name && name) patch.name = name;
    let upgradedEmail = false;
    if (
      matchedBy === "phone" &&
      SYNTHETIC_EMAIL_RE.test(user.email) &&
      emailLower &&
      !SYNTHETIC_EMAIL_RE.test(emailLower)
    ) {
      // Make sure no other user already owns this email before we move it.
      const collision = await db.user.findUnique({ where: { email: emailLower } });
      if (!collision) {
        patch.email = emailLower;
        upgradedEmail = true;
      }
    }
    if (Object.keys(patch).length > 0) {
      await db.user.update({ where: { id: user.id }, data: patch });
    }
    return { userId: user.id, isNew: false, matchedBy, upgradedEmail };
  }

  // 4. No match — create. Random placeholder hash so they can't log in
  //    until they go through /forgot-password and set a real one.
  const placeholderHash = await bcrypt.hash(
    `${crypto.randomUUID()}-${crypto.randomUUID()}`,
    10,
  );
  const created = await db.user.create({
    data: {
      email: emailLower,
      name: name || "Guest",
      phone: phone || null,
      role: "CLIENT",
      passwordHash: placeholderHash,
    },
  });
  return {
    userId: created.id,
    isNew: true,
    matchedBy: null,
    upgradedEmail: false,
  };
}
