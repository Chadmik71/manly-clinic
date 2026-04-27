import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/portal");
  return <>{children}</>;
}
