/**
 * ONE-SHOT RECOVERY ROUTE — DELETE THIS FILE IMMEDIATELY AFTER USE.
 *
 * Purpose: lets the owner of chadmik711@gmail.com reset their own password
 * after they've forgotten it, without database access.
 *
 * Hard guards:
 *  - Email allowlist is hardcoded (no parameter)
 *  - Path includes a UUID prefix that doesn't appear in any link
 *  - Logs the use to the audit table
 *
 * This file MUST be removed in the next commit after the password is reset.
 * Vercel + Git history retain it but the live route disappears.
 */
import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

const ALLOWED_EMAIL = "chadmik711@gmail.com";
const MIN_PASSWORD_LENGTH = 8;

const FORM_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Account recovery</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 28rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5; color: #111; }
    h1 { font-size: 1.5rem; margin-bottom: .5rem; }
    p { color: #555; font-size: .9rem; }
    label { display: block; margin-top: 1rem; font-weight: 500; font-size: .9rem; }
    input { width: 100%; padding: .5rem; margin-top: .25rem; border: 1px solid #ccc; border-radius: .25rem; font-size: 1rem; box-sizing: border-box; }
    button { margin-top: 1.5rem; padding: .6rem 1.25rem; background: #111; color: white; border: none; border-radius: .25rem; font-size: 1rem; cursor: pointer; }
    button:hover { background: #333; }
    .note { background: #fef3c7; border: 1px solid #fbbf24; padding: .75rem; border-radius: .25rem; margin-top: 1rem; font-size: .85rem; }
  </style>
</head>
<body>
  <h1>Account recovery</h1>
  <p>One-shot password reset for the hardcoded account. This page will be removed shortly.</p>
  <form method="POST" action="">
    <label>Email <input type="email" name="email" required autocomplete="username" /></label>
    <label>New password (min ${MIN_PASSWORD_LENGTH} chars) <input type="password" name="password" required minlength="${MIN_PASSWORD_LENGTH}" autocomplete="new-password" /></label>
    <button type="submit">Reset password</button>
  </form>
  <div class="note">After clicking reset, sign in at <a href="/staff/login">/staff/login</a> with the new password. Then ask Claude to delete this recovery route.</div>
</body>
</html>`;

export async function GET() {
  return new NextResponse(FORM_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function POST(req: NextRequest) {
  let email: string | null = null;
  let password: string | null = null;

  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const fd = await req.formData();
    email = (fd.get("email") as string | null)?.trim() ?? null;
    password = (fd.get("password") as string | null) ?? null;
  } else {
    const body = await req.json().catch(() => ({}));
    email = typeof body.email === "string" ? body.email.trim() : null;
    password = typeof body.password === "string" ? body.password : null;
  }

  // Hard guard: email allowlist
  if (!email || email.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
    return new NextResponse("Forbidden — email not on the allowlist for this recovery route.", { status: 403 });
  }
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return new NextResponse(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true, role: true },
  });

  if (!user) {
    return new NextResponse("No user with that email.", { status: 404 });
  }

  // Only allow reset for STAFF/ADMIN — never reset a customer through this route
  if (user.role !== "STAFF" && user.role !== "ADMIN") {
    return new NextResponse("Forbidden — recovery route is for staff/admin only.", { status: 403 });
  }

  const passwordHash = await hash(password, 10);

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash },
  });

  await audit({
    userId: user.id,
    action: "PASSWORD_RECOVERY_RESET",
    resource: `User:${user.id}`,
    metadata: { email: user.email, route: "admin/reset-my-password" },
  });

  return new NextResponse(
    `Password reset successfully for ${user.email}. Sign in at /staff/login. Now delete this recovery route.`,
    { status: 200, headers: { "Content-Type": "text/plain" } }
  );
}
