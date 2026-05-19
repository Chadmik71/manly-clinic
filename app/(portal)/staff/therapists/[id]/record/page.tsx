import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPrice, therapistInternalName } from "@/lib/utils";
import { sydneyDateLong, sydneyTimeShort, SYDNEY_TZ } from "@/lib/time";
import { CLINIC } from "@/lib/clinic";

// Sydney-TZ formatters used throughout this page. Server runtime is UTC on
// Vercel, so anything that uses date-fns format() would render off by 10/11h.
const sydDateMedium = new Intl.DateTimeFormat("en-AU", {
  timeZone: SYDNEY_TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const sydFmt = new Intl.DateTimeFormat("en-AU", {
  timeZone: SYDNEY_TZ,
  dateStyle: "medium",
  timeStyle: "short",
});

export const metadata = { title: "Therapist record" };

/**
 * Audit-friendly record of all bookings this therapist has performed (or is
 * scheduled to perform). Mirrors the shape of /staff/clients/[id]/record so
 * staff can hand it to a health-fund auditor or simply print for their own
 * records.
 *
 * The booking set covers TWO sources:
 *   1. Bookings explicitly assigned to this therapist via the audit-side
 *      assignedTherapistId field (the post-Phase-2 source of truth).
 *   2. Legacy bookings where this person was the auto-assigned
 *      Booking.therapist AND no audit assignment has been made yet.
 *
 * Bookings with an audit assignment to a DIFFERENT person are intentionally
 * excluded — the audit answer always wins.
 */
export default async function TherapistRecordPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ service?: string }>;
}) {
  const session = (await auth())!;
  if (session.user.role !== "ADMIN") {
    notFound();
  }
  const { id } = await params;
  const sp = await searchParams;
  const serviceFilter = sp.service ?? null;

  const t = await db.therapist.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!t) notFound();

  // Pull all bookings (no service filter at the DB layer — we want the full
  // list to compute service breakdown stats, then filter client-side).
  const allBookings = await db.booking.findMany({
    where: {
      OR: [
        { assignedTherapistId: t.user.id },
        {
          AND: [
            { assignedTherapistId: null },
            { therapistId: t.id },
          ],
        },
      ],
    },
    include: {
      service: { select: { id: true, name: true } },
      variant: { select: { durationMin: true } },
      client: { select: { id: true, name: true, email: true } },
    },
    orderBy: { startsAt: "desc" },
  });

  // Service distribution stats — across ALL bookings, not the filtered set.
  const serviceCountMap = new Map<string, { id: string; name: string; count: number }>();
  for (const b of allBookings) {
    const existing = serviceCountMap.get(b.service.id);
    if (existing) existing.count++;
    else serviceCountMap.set(b.service.id, { id: b.service.id, name: b.service.name, count: 1 });
  }
  const services = [...serviceCountMap.values()].sort((a, b) => b.count - a.count);

  const bookings = serviceFilter
    ? allBookings.filter((b) => b.service.id === serviceFilter)
    : allBookings;
  const filteredService = serviceFilter
    ? services.find((s) => s.id === serviceFilter)
    : null;

  await audit({
    userId: session.user.id,
    action: "VIEW_THERAPIST_RECORD",
    resource: `Therapist:${id}`,
    metadata: {
      therapistName: t.user.name,
      therapistUserId: t.user.id,
      totalBookings: allBookings.length,
      filteredService: serviceFilter,
      filteredCount: bookings.length,
    },
  });

  const generatedAt = new Date();
  const filteredRevenue = bookings.reduce((sum, b) => sum + b.priceCentsAtBooking, 0);
  const completedRevenue = bookings
    .filter((b) => b.status === "COMPLETED")
    .reduce((sum, b) => sum + b.priceCentsAtBooking, 0);
  const completedCount = bookings.filter((b) => b.status === "COMPLETED").length;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .booking-entry { page-break-inside: avoid; }
          .section-header { page-break-after: avoid; }
          .record-container { padding: 0 !important; max-width: none !important; }
        }
        @media screen {
          .record-container {
            max-width: 800px;
            margin: 0 auto;
            padding: 2rem;
            background: white;
            color: black;
          }
          .record-container * { color: black; }
        }
      `}</style>

      <div className="no-print bg-muted/30 border-b p-3">
        <div className="max-w-[800px] mx-auto flex items-center justify-between flex-wrap gap-2">
          <Link
            href={`/staff/therapists/${id}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to therapist profile
          </Link>
          <p className="text-sm text-muted-foreground">
            Press <kbd className="rounded border px-1 text-xs">Ctrl/Cmd+P</kbd>{" "}
            to print or save as PDF
          </p>
        </div>
      </div>

      <div className="record-container">
        <header className="border-b-2 pb-4 mb-6">
          <p className="text-xs uppercase tracking-wider text-gray-600">{CLINIC.name}</p>
          <h1 className="text-2xl font-bold mt-1">Therapist record</h1>
          <h2 className="text-xl mt-2">{therapistInternalName(t)}</h2>
          {t.providerNumber && (
            <p className="text-sm text-gray-700 mt-1">
              Provider number: <span className="font-mono">{t.providerNumber}</span>
              {t.associationName ? ` · ${t.associationName}` : ""}
            </p>
          )}
          <p className="text-xs text-gray-600 mt-2">
            Generated by {session.user.name} on {sydFmt.format(generatedAt)} (Sydney time)
          </p>
          <p className="text-xs text-gray-600 mt-1">
            Includes audit-side assigned bookings AND legacy auto-assignments where
            no audit assignment was made. Bookings explicitly assigned to a
            different person are excluded.
          </p>
        </header>

        {/* Filter — hidden from print */}
        <section className="no-print mb-6">
          <form className="flex items-end gap-2 flex-wrap">
            <label className="flex flex-col text-sm">
              <span className="text-xs text-gray-600 mb-1">Filter by service</span>
              <select
                name="service"
                defaultValue={serviceFilter ?? ""}
                className="rounded-md border border-gray-300 px-2 py-1 text-sm bg-white"
              >
                <option value="">All services ({allBookings.length})</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.count})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
            >
              Apply
            </button>
            {serviceFilter && (
              <Link
                href={`/staff/therapists/${id}/record`}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100"
              >
                Clear
              </Link>
            )}
          </form>
        </section>

        {/* Summary stats */}
        <section className="mb-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-3 section-header">
            Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <SummaryStat label="Total bookings" value={String(allBookings.length)} />
            <SummaryStat
              label={filteredService ? "Filtered" : "Showing"}
              value={String(bookings.length)}
              note={filteredService ? filteredService.name : null}
            />
            <SummaryStat label="Completed" value={`${completedCount} · ${formatPrice(completedRevenue)}`} />
            <SummaryStat label="Filtered revenue" value={formatPrice(filteredRevenue)} />
          </div>
        </section>

        {/* Service breakdown */}
        <section className="mb-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-3 section-header">
            Bookings by service
          </h3>
          {services.length === 0 ? (
            <p className="text-sm text-gray-600 italic">No bookings yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-gray-600">
                <tr className="text-left border-b">
                  <th className="py-1.5">Service</th>
                  <th className="py-1.5 text-right">Bookings</th>
                </tr>
              </thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id} className="border-b">
                    <td className="py-1.5">{s.name}</td>
                    <td className="py-1.5 text-right font-mono">{s.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Treatment history */}
        <section className="mb-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700 mb-3 section-header">
            {filteredService ? `${filteredService.name} bookings` : "All bookings"}
            {" — "}
            {bookings.length} {bookings.length === 1 ? "entry" : "entries"}
          </h3>
          {bookings.length === 0 ? (
            <p className="text-sm text-gray-600 italic">
              No bookings match the selected filter.
            </p>
          ) : (
            <div className="space-y-3">
              {bookings.map((b) => {
                const isAuditAssigned = b.assignedTherapistId === t.user.id;
                const isLegacyOnly = !b.assignedTherapistId && b.therapistId === t.id;
                return (
                  <div key={b.id} className="booking-entry border rounded-md p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-1">
                      <div>
                        <span className="font-semibold">{sydneyDateLong(b.startsAt)}</span>
                        <span className="text-xs text-gray-600 ml-2">
                          {sydneyTimeShort(b.startsAt)} – {sydneyTimeShort(b.endsAt)}{" "}
                          ({b.variant.durationMin} min)
                        </span>
                      </div>
                      <span className="text-xs font-mono text-gray-600">
                        Ref: {b.reference}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700">
                      {b.service.name} · {b.client.name} · {formatPrice(b.priceCentsAtBooking)}{" "}
                      · {b.status}
                      {b.claimWithHealthFund ? " · Health fund claim" : ""}
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">
                      {isAuditAssigned
                        ? "Assigned for clinical record"
                        : isLegacyOnly
                          ? "Legacy auto-assignment (no audit assignment)"
                          : ""}
                      {b.slotLabel ? ` · Slot: ${b.slotLabel}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <footer className="mt-8 pt-4 border-t text-xs text-gray-600">
          <p>
            End of record. Generated {sydFmt.format(generatedAt)} by {session.user.name}.
          </p>
          <p className="mt-1">
            {CLINIC.name}
            {CLINIC.phone ? ` · ${CLINIC.phone}` : ""}
            {CLINIC.email ? ` · ${CLINIC.email}` : ""}
          </p>
        </footer>
      </div>
    </>
  );
}

function SummaryStat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string | null;
}) {
  return (
    <div>
      <div className="text-xs uppercase text-gray-600">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {note ? <div className="text-xs text-gray-600 mt-0.5 truncate">{note}</div> : null}
    </div>
  );
}
