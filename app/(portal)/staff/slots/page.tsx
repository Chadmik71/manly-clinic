import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { StaffShell } from "@/components/staff-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SlotRow } from "./slot-row";
import {
  createSlot,
  renameSlot,
  toggleSlotActive,
  deleteSlot,
  seedDefaultSlotsIfEmpty,
  setCapacityOverride,
  deleteCapacityOverride,
} from "./actions";
import { sydneyTodayISO } from "@/lib/time";

export const metadata = { title: "Service slots" };

export default async function SlotsPage() {
  const session = (await auth())!;

  // First-visit convenience: if no slots exist yet, populate four defaults.
  // Idempotent — does nothing once any slot exists.
  await seedDefaultSlotsIfEmpty();

  const slots = await db.slot.findMany({
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
  });

  const activeCount = slots.filter((s) => s.active).length;

  const today = sydneyTodayISO();
  const overrides = await db.dailyCapacityOverride.findMany({
    orderBy: { date: "asc" },
  });
  const futureOverrides = overrides.filter((o) => o.date >= today);
  const pastOverrides = overrides.filter((o) => o.date < today);

  return (
    <StaffShell
      user={session.user}
      topbar={
        <span className="text-foreground font-medium">Service slots</span>
      }
    >
      <div className="p-4 max-w-3xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Service slots</CardTitle>
            <CardDescription>
              Each slot represents one concurrent booking the clinic can take
              at any given time. Customers see the slot label (e.g.
              &ldquo;Therapist 1&rdquo;) when they book and in their
              confirmation. Deactivate a slot to stop new bookings using it
              when you&rsquo;re short-staffed; existing bookings on that slot
              are unaffected.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              <span className="font-medium">{activeCount}</span> active &middot;{" "}
              <span className="font-medium">{slots.length - activeCount}</span>{" "}
              inactive
            </p>

            {slots.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No slots yet.
              </p>
            ) : (
              <div className="space-y-2">
                {slots.map((s) => (
                  <SlotRow
                    key={s.id}
                    slot={{ id: s.id, label: s.label, active: s.active }}
                    renameAction={renameSlot}
                    toggleAction={toggleSlotActive}
                    deleteAction={deleteSlot}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add slot</CardTitle>
            <CardDescription>
              Add a new slot when you can take more concurrent bookings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
            action={async (fd) => {
              "use server";
              await createSlot(fd);
            }}
            className="flex flex-wrap items-end gap-3"
          >
              <div className="space-y-1.5">
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label"
                  name="label"
                  required
                  maxLength={80}
                  placeholder="e.g. Therapist 5"
                  className="min-w-[220px]"
                />
              </div>
              <Button type="submit">Add slot</Button>
            </form>
          </CardContent>
        </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-day capacity overrides</CardTitle>
          <CardDescription>
            Cap the number of active slots usable on a specific date — e.g. when
            a therapist calls in sick or for a half-day. The effective active
            count for that day will be{" "}
            <span className="font-medium">min(cap, total active = {activeCount})</span>.
            Setting an override for the same date again updates it; delete to
            remove. Set to 0 to mark a day as &ldquo;closed&rdquo; for slot-based
            bookings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            action={async (fd) => {
              "use server";
              await setCapacityOverride(fd);
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="ov-date">Date</Label>
              <Input id="ov-date" name="date" type="date" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ov-cap">Max active</Label>
              <Input
                id="ov-cap"
                name="maxActiveSlots"
                type="number"
                min={0}
                max={50}
                required
                defaultValue={Math.max(0, activeCount - 1)}
                className="w-24"
              />
            </div>
            <div className="space-y-1.5 flex-1 min-w-[200px]">
              <Label htmlFor="ov-reason">Reason (optional)</Label>
              <Input
                id="ov-reason"
                name="reason"
                maxLength={200}
                placeholder="e.g. Joy sick, half-day, Christmas eve"
              />
            </div>
            <Button type="submit">Set override</Button>
          </form>

          {overrides.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No overrides set.
            </p>
          ) : (
            <div className="space-y-3">
              {futureOverrides.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Future / today
                  </h4>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                        <th className="py-1.5">Date</th>
                        <th className="py-1.5">Cap</th>
                        <th className="py-1.5">Reason</th>
                        <th className="py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {futureOverrides.map((o) => (
                        <tr key={o.id} className="border-b">
                          <td className="py-1.5 font-mono">{o.date}</td>
                          <td className="py-1.5">{o.maxActiveSlots}</td>
                          <td className="py-1.5">{o.reason ?? "—"}</td>
                          <td className="py-1.5 text-right">
                            <form
                              action={async (fd) => {
                                "use server";
                                await deleteCapacityOverride(fd);
                              }}
                            >
                              <input type="hidden" name="id" value={o.id} />
                              <button
                                type="submit"
                                className="text-xs text-destructive hover:underline"
                              >
                                Delete
                              </button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {pastOverrides.length > 0 && (
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Past
                  </h4>
                  <table className="w-full text-sm text-muted-foreground">
                    <thead>
                      <tr className="text-left text-xs uppercase border-b">
                        <th className="py-1.5">Date</th>
                        <th className="py-1.5">Cap</th>
                        <th className="py-1.5">Reason</th>
                        <th className="py-1.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {pastOverrides.map((o) => (
                        <tr key={o.id} className="border-b">
                          <td className="py-1.5 font-mono">{o.date}</td>
                          <td className="py-1.5">{o.maxActiveSlots}</td>
                          <td className="py-1.5">{o.reason ?? "—"}</td>
                          <td className="py-1.5 text-right">
                            <form
                              action={async (fd) => {
                                "use server";
                                await deleteCapacityOverride(fd);
                              }}
                            >
                              <input type="hidden" name="id" value={o.id} />
                              <button
                                type="submit"
                                className="text-xs text-destructive hover:underline"
                              >
                                Delete
                              </button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </StaffShell>
  );
}
