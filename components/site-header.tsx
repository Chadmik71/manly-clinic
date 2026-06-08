"use client";
import Link from "next/link";
import { useState } from "react";
import Image from "next/image";
import { Menu, X, Phone } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { CLINIC } from "@/lib/clinic";

const nav = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export function SiteHeader({ user }: { user?: { name: string; role: string } | null }) {
  const [open, setOpen] = useState(false);
  const portalHref =
    user?.role === "STAFF" || user?.role === "ADMIN" ? "/staff" : "/portal";
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Image
            src="/logo-icon.png"
            alt={CLINIC.name}
            width={80}
            height={80}
            priority
            className="h-10 w-10"
          />
          <span className="hidden sm:inline">{CLINIC.name}</span>
          <span className="sm:hidden">MRC</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          {/* Click-to-call — shown on every size, but its real job is mobile:
              most "massage near me" visitors are on a phone and want to call,
              not fill a form. Sits left of the booking actions. */}
          <Button asChild variant="ghost" size="icon" aria-label={`Call ${CLINIC.name}`}>
            <a href={`tel:${CLINIC.phoneE164}`}>
              <Phone className="h-5 w-5" />
            </a>
          </Button>
          <ThemeToggle />
          {user ? (
            <Button asChild variant="outline" size="sm">
              <Link href={portalHref}>
                {user.role === "STAFF" || user.role === "ADMIN"
                  ? "Staff dashboard"
                  : "My portal"}
              </Link>
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
          )}
          <Button asChild size="sm" className="hidden sm:inline-flex">
            <Link href="/book">Book now</Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Menu"
            onClick={() => setOpen(!open)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>
      {open && (
        <div className="md:hidden border-t bg-background">
          <nav className="container flex flex-col gap-1 py-3 text-sm">
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2 hover:bg-accent"
              >
                {n.label}
              </Link>
            ))}
            <a
              href={`tel:${CLINIC.phoneE164}`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-accent"
            >
              <Phone className="h-4 w-4" />
              Call {CLINIC.phone}
            </a>
            <div className="flex gap-2 pt-2">
              {user ? (
                <Button asChild variant="outline" className="flex-1">
                  <Link href={portalHref}>Portal</Link>
                </Button>
              ) : (
                <Button asChild variant="outline" className="flex-1">
                  <Link href="/login">Sign in</Link>
                </Button>
              )}
              <Button asChild className="flex-1">
                <Link href="/book">Book</Link>
              </Button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
