import { getClinicSettings } from "@/lib/clinic-settings";
import { SettingsForm } from "./settings-form";

export const metadata = {
  title: "Clinic settings | Manly Remedial Thai",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const settings = await getClinicSettings();

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold">Clinic settings</h1>
        <p className="text-sm text-muted-foreground">
          Controls for online booking deposits and the customer card surcharge. Changes take effect on the next PaymentIntent created - existing bookings are not affected.
        </p>
      </header>
      <SettingsForm initial={settings} />
    </div>
  );
}
