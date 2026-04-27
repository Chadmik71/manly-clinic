"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Stethoscope,
  LogOut,
  User,
  Calendar,
  ClipboardList,
  ShieldCheck,
  LayoutDashboard,
  CalendarDays,
  Users,
  ListChecks,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { CLINIC } from "@/lib/clinic";
import { cn } from "@/lib/utils";

type Section = "client" | "staff";

const NAVS: Record<Section, { href: string; label: string; icon: LucideIcon }[]> = {
  client: [
    { href: "/portal", label: "Overview", icon: User },
    { href: "/portal/bookings", label: "My bookings", icon: Calendar },
    { href: "/portal/intake", label: "Intake form", icon: ClipboardList },
    { href: "/portal/data", label: "Data & privacy", icon: ShieldCheck },
  ],
  staff: [
    { href: "/staff", label: "Today", icon: LayoutDashboard },
    { href: "/staff/schedule", label: "Schedule", icon: CalendarDays },
    { href: "/staff/bookings", label: "All bookings", icon: ListChecks },
    { href: "/staff/clients", label: "Clients", icon: Users },
    { href: "/staff/therapists", label: "Therapists", icon: Stethoscope },
    { href: "/staff/services", label: "Services", icon: Settings },
  ],
};

export function PortalShell({
  title,
  user,
  section,
  children,
}: {
  title: string;
  user: { name: string; email: string; role: string };
  section: Section;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const nav = NAVS[section];
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-background sticky top-0 z-40">
        <div className="container h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <Stethoscope className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">{CLINIC.name}</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
              <User className="h-4 w-4" /> {user.name}
            </span>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => signOut({ callbackUrl: "/" })}
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <div className="flex-1 container py-6 md:py-10 grid md:grid-cols-[220px_1fr] gap-8">
        <aside className="md:sticky md:top-20 md:self-start space-y-1">
          {nav.map((it) => {
            const active =
              pathname === it.href ||
              (it.href !== "/portal" && it.href !== "/staff" && pathname.startsWith(it.href));
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" /> {it.label}
              </Link>
            );
          })}
        </aside>
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-6">{title}</h1>
          {children}
        </div>
      </div>
    </div>
  );
}
