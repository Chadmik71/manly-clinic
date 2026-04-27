"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ListChecks, Users, Stethoscope, Settings, LogOut, ChevronLeft, ChevronRight, Clock, BarChart3, Gift, UserCircle } from "lucide-react";
import { signOut } from "next-auth/react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { CLINIC } from "@/lib/clinic";
import { cn } from "@/lib/utils";

const RAIL = [
  { href: "/staff/schedule", label: "Calendar", icon: CalendarDays },
  { href: "/staff/bookings", label: "Bookings", icon: ListChecks },
  { href: "/staff/clients", label: "Clients", icon: Users },
  { href: "/staff/reports", label: "Reports", icon: BarChart3 },
  { href: "/staff/vouchers", label: "Vouchers", icon: Gift },
  { href: "/staff/therapists", label: "Therapists", icon: Stethoscope },
  { href: "/staff/services", label: "Services", icon: Settings },
];

export function StaffShell({ user, topbar, children }: { user: { name: string; email: string; role: string }; topbar?: React.ReactNode; children: React.ReactNode; }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden sm:flex w-14 flex-col items-center border-r bg-[hsl(var(--rail))] py-3 gap-1 sticky top-0 self-start h-screen">
        <Link href="/staff" className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground font-bold mb-2" title={CLINIC.name}>M</Link>
        {RAIL.map((it) => {
          const active = pathname === it.href || (it.href !== "/staff" && pathname.startsWith(it.href));
          const Icon = it.icon;
          return (
            <Link key={it.href} href={it.href} title={it.label} className={cn("grid h-10 w-10 place-items-center rounded-md transition-colors", active ? "bg-primary text-primary-foreground" : "text-[hsl(var(--rail-foreground))] hover:bg-accent hover:text-accent-foreground")}>
              <Icon className="h-4.5 w-4.5" />
            </Link>
          );
        })}
        <div className="flex-1" />
        <Link href="/staff/account" title="My Account" className={cn("grid h-10 w-10 place-items-center rounded-md transition-colors", pathname.startsWith("/staff/account") ? "bg-primary text-primary-foreground" : "text-[hsl(var(--rail-foreground))] hover:bg-accent hover:text-accent-foreground")}>
          <UserCircle className="h-4.5 w-4.5" />
        </Link>
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={() => signOut({ callbackUrl: "/" })} aria-label="Sign out" title="Sign out"><LogOut className="h-4 w-4" /></Button>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-12 border-b bg-card flex items-center px-4 gap-4 text-sm sticky top-0 z-30 backdrop-blur supports-[backdrop-filter]:bg-card/80">
          <span className="text-muted-foreground">{CLINIC.name} <span className="opacity-60">·</span> <span className="capitalize">{pathname.split("/")[2] ?? "today"}</span></span>
          <div className="flex-1 flex justify-center">{topbar}</div>
          <Link href="/staff/account" className="hidden md:inline text-muted-foreground hover:text-foreground">{user.name}</Link>
        </header>
        <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-40 border-t bg-card flex justify-around py-1.5">
          {RAIL.map((it) => {
            const active = pathname === it.href || (it.href !== "/staff" && pathname.startsWith(it.href));
            const Icon = it.icon;
            return (
              <Link key={it.href} href={it.href} className={cn("flex flex-col items-center gap-0.5 px-2 py-1 rounded-md text-[10px]", active ? "text-primary" : "text-muted-foreground")}>
                <Icon className="h-4 w-4" />{it.label}
              </Link>
            );
          })}
        </nav>
        <main className="flex-1 min-w-0 pb-16 sm:pb-0">{children}</main>
      </div>
    </div>
  );
}

export function DateNav({ date, basePath, extraQuery }: { date: Date; basePath: string; extraQuery?: string; }) {
  const day = new Date(date);
  const yest = new Date(day); yest.setDate(day.getDate() - 1);
  const tom = new Date(day); tom.setDate(day.getDate() + 1);
  const fmt = (d: Date) => d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const q = extraQuery ? `&${extraQuery}` : "";
  return (
    <div className="flex items-center gap-2">
      <Link href={`${basePath}?date=${iso(yest)}${q}`} className="grid h-7 w-7 place-items-center rounded-md hover:bg-accent text-muted-foreground" aria-label="Previous day"><ChevronLeft className="h-4 w-4" /></Link>
      <span className="font-medium tabular-nums flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-muted-foreground" />{fmt(day)}</span>
      <Link href={`${basePath}?date=${iso(tom)}${q}`} className="grid h-7 w-7 place-items-center rounded-md hover:bg-accent text-muted-foreground" aria-label="Next day"><ChevronRight className="h-4 w-4" /></Link>
      <Link href={`${basePath}?date=${iso(new Date())}${q}`} className="ml-2 px-2 py-0.5 rounded-md border text-xs hover:bg-accent">Today</Link>
    </div>
  );
}
