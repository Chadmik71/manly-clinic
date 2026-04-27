import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { Stethoscope } from "lucide-react";
import { CLINIC } from "@/lib/clinic";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <Stethoscope className="h-4 w-4" />
            </span>
            {CLINIC.name}
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="flex-1 grid place-items-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
