import { auth } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { getSiteContent } from "@/lib/site-content";

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, { clinic }] = await Promise.all([auth(), getSiteContent()]);
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader
        user={
          session?.user
            ? { name: session.user.name, role: session.user.role }
            : null
        }
        phone={{ display: clinic.phone, e164: clinic.phoneE164 }}
      />
      <main className="flex-1 grid place-items-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <SiteFooter clinic={clinic} />
    </div>
  );
}
