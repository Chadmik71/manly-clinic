import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export default async function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/staff");
  if (session.user.role !== "STAFF" && session.user.role !== "ADMIN") {
    redirect("/portal");
  }
  return <>{children}</>;
}
