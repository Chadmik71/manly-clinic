import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { z } from "zod";
import { authConfig } from "@/lib/auth.config";
import { getClientIp, rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { consumeMagicLinkToken } from "@/lib/magic-link";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        // Throttle credential attempts per source IP to blunt brute-force and
        // credential-stuffing. Tripping the limit returns null — identical to a
        // wrong password from the caller's perspective, so it leaks nothing
        // about which accounts exist. Note: the limiter is per-lambda-instance
        // (see lib/rate-limit.ts), so this is a deterrent, not a hard lock —
        // pair with Vercel WAF for a true boundary.
        const ip = getClientIp(request as Request);
        const limit = rateLimit(
          `login:${ip}`,
          RATE_LIMITS.login.limit,
          RATE_LIMITS.login.windowMs,
        );
        if (!limit.allowed) return null;

        const user = await db.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user) return null;
        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash,
        );
        if (!valid) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
    // One-tap email sign-in link for clients (lib/magic-link.ts). The token
    // is single-use, expires after 20 minutes and only works for CLIENT
    // accounts; sign-in attempts share the login rate limit.
    Credentials({
      id: "magic-link",
      name: "Email link",
      credentials: { token: { label: "Token", type: "text" } },
      async authorize(credentials, request) {
        const token = typeof credentials?.token === "string" ? credentials.token : "";
        if (!token) return null;
        const ip = getClientIp(request as Request);
        const limit = rateLimit(`login:${ip}`, RATE_LIMITS.login.limit, RATE_LIMITS.login.windowMs);
        if (!limit.allowed) return null;
        const user = await consumeMagicLinkToken(token);
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      },
    }),
  ],
});
