import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const protectedPrefix = ["/portal", "/staff"];
  const requiresAuth = protectedPrefix.some((p) => pathname.startsWith(p));

  if (requiresAuth && !session) {
    const url = new URL("/login", req.url);
    url.searchParams.set("from", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/staff")) {
    const role = session?.user?.role;
    if (role !== "STAFF" && role !== "ADMIN") {
      return NextResponse.redirect(new URL("/portal", req.url));
    }
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/portal/:path*", "/staff/:path*"],
};
