import type { NextAuthConfig } from "next-auth";

// Edge-safe config: no DB / bcryptjs imports here so it's usable
// from middleware. The full config (with the credentials provider)
// lives in lib/auth.ts and is only evaluated in the Node runtime.
// Sign-in lifetime. The session cookie is refreshed on every visit, so
// IDLE_SECONDS is an inactivity timeout; MAX_LOGIN_SECONDS is a hard cap
// from the moment of sign-in, so a stolen cookie (or a role change) can't
// ride on an old login forever. Staff and clients sign in at least daily.
const IDLE_SECONDS = 12 * 60 * 60;
const MAX_LOGIN_SECONDS = 24 * 60 * 60;

export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt", maxAge: IDLE_SECONDS },
  pages: { signIn: "/login" },
  providers: [], // populated in lib/auth.ts
  callbacks: {
    async jwt({ token, user }) {
      const now = Math.floor(Date.now() / 1000);
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: string }).role;
        token.loginAt = now;
      }
      // Returning null clears the session cookie. Tokens issued before
      // loginAt existed have none, so everyone signs in once more.
      const loginAt = typeof token.loginAt === "number" ? token.loginAt : 0;
      if (now - loginAt > MAX_LOGIN_SECONDS) return null;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.id as string;
        (session.user as { role?: string }).role = token.role as string;
      }
      return session;
    },
  },
};
