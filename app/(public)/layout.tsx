import { auth } from "@/lib/auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { InstallAppHint } from "@/components/install-app-hint";
import { getSiteContent } from "@/lib/site-content";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, content] = await Promise.all([auth(), getSiteContent()]);
  const banner = content.bannerEnabled ? content.bannerMessage.trim() : "";
  return (
    <div className="flex min-h-screen flex-col">
      {banner && (
        <div role="status" className="bg-primary px-4 py-2 text-center text-sm font-medium text-primary-foreground whitespace-pre-line">
          {banner}
        </div>
      )}
      <SiteHeader
        user={session?.user ? { name: session.user.name, role: session.user.role } : null}
        phone={{ display: content.clinic.phone, e164: content.clinic.phoneE164 }}
      />
      <main className="flex-1">{children}</main>
      <SiteFooter clinic={content.clinic} />
      <InstallAppHint />
    </div>
  );
}
