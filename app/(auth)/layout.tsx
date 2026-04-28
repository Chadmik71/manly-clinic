import { auth } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader
        user={
          session?.user
            ? { name: session.user.name, role: session.user.role }
            : null
        }
      />
      <main className="flex-1 grid place-items-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
