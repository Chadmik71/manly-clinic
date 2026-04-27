import type { NextAuthConfig } from "next-auth";

// Edge-safe config: no DB / bcryptjs imports here so it's usable
// from middleware. The full config (with the credentials provider)
// lives in lib/auth.ts and is only evaluated in the Node runtime.
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [], // populated in lib/auth.ts
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as { id: string }).id;
        token.role = (user as { role: string }).role;
      }
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
