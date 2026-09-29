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
//  3. Patch missing name/phone only. The stored email is NEVER replaced
//     here, even an imported placeholder: a phone match plus a typed email
//     isn't proof of identity, and moving the email would let anyone who
//     knows a client's mobile number reset their password and read their
//     health record. Staff add real emails in person instead (Online account
//     box + invite, app/(portal)/staff/clients/account-actions.ts). The
//     booking confirmation still goes to the email the guest typed.
//  4. No match → create a new user with an unguessable placeholder hash;
//     they'll set a real password via forgot-password if they ever want
//     to log in.

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export type MergeResult = {
  userId: string;
  isNew: boolean;
  matchedBy: "email" | "phone" | null;
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
    // 3. Patch missing fields only; never overwrite what the record has
    //    (the email in particular, see the header comment).
    const patch: Record<string, unknown> = {};
    if (!user.phone && phone) patch.phone = phone;
    if (!user.name && name) patch.name = name;
    if (Object.keys(patch).length > 0) {
      await db.user.update({ where: { id: user.id }, data: patch });
    }
    return { userId: user.id, isNew: false, matchedBy };
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
  };
}
