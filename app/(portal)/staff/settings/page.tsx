import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getClinicSettings } from "@/lib/clinic-settings";
import { SettingsForm } from "./settings-form";
import { StaffShell } from "@/components/staff-shell";

export const metadata = {
  title: "Clinic settings | Manly Remedial Thai",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/staff/settings");
  if (session.user.role !== "ADMIN") redirect("/staff");

  const settings = await getClinicSettings();

  return (
    <StaffShell user={session.user}>
      <div className="p-4 space-y-6 max-w-2xl">
        <header>
          <h1 className="text-lg font-semibold">Clinic settings</h1>
          <p className="text-sm text-muted-foreground">
            Controls for online booking deposits and the customer card surcharge. Changes take effect on the next PaymentIntent created - existing bookings are not affected.
          </p>
        </header>
        <SettingsForm initial={settings} />
      </div>
    </StaffShell>
  );
}
