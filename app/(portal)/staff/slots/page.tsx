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
} from "./actions";

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
      </div>
    </StaffShell>
  );
}
