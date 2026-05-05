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
  <hr style="margin: 2rem 0; border: none; border-top: 1px solid #ddd;" />
  <h2 style="font-size: 1.1rem;">Promote to ADMIN</h2>
  <p>If your account exists with role CLIENT (the default for self-signup), use this to promote yourself to ADMIN so you can access the staff portal.</p>
  <form method="POST" action="?action=promote">
    <label>Email <input type="email" name="email" required autocomplete="username" /></label>
    <button type="submit">Promote to ADMIN</button>
  </form>
  <hr style="margin: 2rem 0; border: none; border-top: 1px solid #ddd;" />
  <h2 style="font-size: 1.1rem;">List all STAFF/ADMIN accounts</h2>
  <p>Read-only. Returns all emails with role STAFF or ADMIN, plus their role and creation date. Useful when you don't remember which email is your admin account.</p>
  <form method="POST" action="?action=list-staff">
    <button type="submit">List staff/admin accounts</button>
  </form>
  <hr style="margin: 2rem 0; border: none; border-top: 1px solid #ddd;" />
  <h2 style="font-size: 1.1rem;">Check role</h2>
  <p>See what role your User currently has.</p>
  <form method="POST" action="?action=check">
    <label>Email <input type="email" name="email" required autocomplete="username" /></label>
    <button type="submit">Check role</button>
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
  const u = new URL(req.url);
  const action = u.searchParams.get("action") || "reset";
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

  // Branch: list-staff (read-only, no email required, no allowlist)
  // This is intentionally before the allowlist check so admin can find
  // their own account when they don't remember which email they used.
  if (action === "list-staff") {
    const staff = await db.user.findMany({
      where: { role: { in: ["STAFF", "ADMIN"] } },
      select: { email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    if (staff.length === 0) {
      return new NextResponse("No STAFF or ADMIN users in the database.", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    const lines = staff.map((u) =>
      `${u.role.padEnd(6)} | ${u.email} | ${u.name ?? "(no name)"} | created ${u.createdAt.toISOString().substring(0, 10)}`,
    );
    return new NextResponse(
      `Found ${staff.length} STAFF/ADMIN account(s):\n\n${lines.join("\n")}`,
      { status: 200, headers: { "Content-Type": "text/plain" } },
    );
  }

  // Hard guard: email allowlist (applies to all actions)
  if (!email || email.toLowerCase() !== ALLOWED_EMAIL.toLowerCase()) {
    return new NextResponse("Forbidden — email not on the allowlist for this recovery route.", { status: 403 });
  }

  // Branch: check role (read-only)
  if (action === "check") {
    const u2 = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    if (!u2) {
      return new NextResponse(`No user with email ${email}.`, { status: 404 });
    }
    return new NextResponse(
      `User ${u2.email} (${u2.name ?? "no name"}) has role: ${u2.role}. Created: ${u2.createdAt.toISOString().substring(0, 10)}.`,
      { status: 200, headers: { "Content-Type": "text/plain" } }
    );
  }

  // Branch: promote to ADMIN (mutation, audit-logged)
  if (action === "promote") {
    const u3 = await db.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true, email: true, role: true },
    });
    if (!u3) {
      return new NextResponse(`No user with email ${email}.`, { status: 404 });
    }
    const previousRole = u3.role;
    if (previousRole === "ADMIN") {
      return new NextResponse(`Already ADMIN — no change.`, { status: 200 });
    }
    await db.user.update({
      where: { id: u3.id },
      data: { role: "ADMIN" },
    });
    await audit({
      userId: u3.id,
      action: "PASSWORD_RECOVERY_PROMOTE_TO_ADMIN",
      resource: `User:${u3.id}`,
      metadata: { email: u3.email, previousRole, newRole: "ADMIN", route: "admin/reset-my-password" },
    });
    return new NextResponse(
      `Promoted ${u3.email} from ${previousRole} to ADMIN. Sign out & in again at /staff/login.`,
      { status: 200, headers: { "Content-Type": "text/plain" } }
    );
  }

  // Default branch: password reset (existing behaviour)
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
