import Link from "next/link";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { CLINIC } from "@/lib/clinic";
import { PrintButton } from "./print-button";
import { consentLabel } from "@/lib/consent-label";

export const metadata = { title: "My information" };
export const dynamic = "force-dynamic";

const SYD = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
const SYD_DATE = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  day: "numeric",
  month: "short",
  year: "numeric",
});
const when = (d: Date | null | undefined) => (d ? SYD.format(d) : "—");
const show = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

/**
 * Everything we hold about the signed-in client, in plain language, ready to
 * print or save as PDF (Australian Privacy Principle 12: access).
 */
export default async function MyInformationPage() {
  const session = (await auth())!;
  const userId = session.user.id;
  const [user, bookings, intakes, consents] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        phone: true,
        dob: true,
        gender: true,
        addressLine1: true,
        suburb: true,
        stateRegion: true,
        postcode: true,
        gpName: true,
        gpClinic: true,
        gpPhone: true,
        healthFundName: true,
        healthFundMemberNumber: true,
        marketingConsent: true,
        createdAt: true,
      },
    }),
    db.booking.findMany({
      where: { clientId: userId },
      orderBy: { startsAt: "desc" },
      select: {
        reference: true,
        startsAt: true,
        status: true,
        claimWithHealthFund: true,
        healthFundName: true,
        priceCentsAtBooking: true,
        service: { select: { name: true } },
        variant: { select: { durationMin: true } },
      },
    }),
    db.intakeForm.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
    db.consentRecord.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);

  await audit({ userId, action: "CLIENT_VIEW_OWN_DATA", metadata: { bookings: bookings.length, intakes: intakes.length } });

  const address = [user?.addressLine1, user?.suburb, user?.stateRegion, user?.postcode].filter(Boolean).join(", ");
  const fund = user?.healthFundName
    ? `${user.healthFundName}${user.healthFundMemberNumber ? ` (member no. ending ${user.healthFundMemberNumber.slice(-3)})` : ""}`
    : "—";

  return (
    <div className="min-h-screen bg-white text-black">
      <div className="mx-auto max-w-3xl px-5 py-8 print:py-0">
        <div className="flex items-center justify-between gap-3 print:hidden mb-6">
          <Link href="/portal/data" className="text-sm text-gray-600 hover:underline">
            ← Back to Data &amp; privacy
          </Link>
          <PrintButton />
        </div>

        <h1 className="text-2xl font-bold">My information</h1>
        <p className="text-sm text-gray-600 mb-6">
          Everything {CLINIC.name} holds about you, as of {SYD.format(new Date())}.
        </p>

        <Section title="Your details">
          <Rows
            rows={[
              ["Name", show(user?.name)],
              ["Email", show(user?.email)],
              ["Phone", show(user?.phone)],
              ["Date of birth", user?.dob ? SYD_DATE.format(user.dob) : "—"],
              ["Gender", show(user?.gender?.toLowerCase().replace(/_/g, " "))],
              ["Address", address || "—"],
              ["GP / doctor", [user?.gpName, user?.gpClinic, user?.gpPhone].filter(Boolean).join(", ") || "—"],
              ["Health fund", fund],
              ["Thank-you / review messages", user?.marketingConsent ? "Yes, you agreed" : "No"],
              ["Client since", user?.createdAt ? SYD_DATE.format(user.createdAt) : "—"],
            ]}
          />
        </Section>

        <Section title={`Your bookings (${bookings.length})`}>
          {bookings.length === 0 ? (
            <p className="text-sm text-gray-600">No bookings.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-1 pr-2">Date</th>
                  <th className="pr-2">Treatment</th>
                  <th className="pr-2">Status</th>
                  <th>Health fund</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.reference} className="border-t align-top">
                    <td className="py-1.5 pr-2 whitespace-nowrap">{when(b.startsAt)}</td>
                    <td className="pr-2">
                      {b.variant.durationMin} min {b.service.name}
                    </td>
                    <td className="pr-2">{b.status.toLowerCase().replace(/_/g, " ")}</td>
                    <td>{b.claimWithHealthFund ? b.healthFundName ?? "claim" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title={`Your health forms (${intakes.length})`}>
          {intakes.length === 0 ? (
            <p className="text-sm text-gray-600">No health forms.</p>
          ) : (
            <div className="space-y-4">
              {intakes.map((f) => (
                <div key={f.id} className="rounded border p-3 break-inside-avoid">
                  <p className="font-semibold text-sm mb-1">Signed {when(f.signedAt ?? f.createdAt)}</p>
                  <Rows
                    rows={[
                      ["Other conditions", show(f.medicalConditions)],
                      ["Medications", show(f.medications)],
                      ["Allergies", show(f.allergies)],
                      ["Injuries / areas to avoid", show(f.injuries)],
                      ["Pregnant", f.pregnancy ? `Yes${f.pregnancyWeeks ? `, ${f.pregnancyWeeks} weeks` : ""}` : "No"],
                      ["Reason for treatment", show(f.reasonForTreatment)],
                      ["Emergency contact", [f.emergencyContactName, f.emergencyContactRelationship, f.emergencyContactPhone].filter(Boolean).join(", ") || "—"],
                      ["Health fund", show(f.healthFundName)],
                      ["Signature on file", f.signatureDataUrl ? "Yes" : "No"],
                    ]}
                  />
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="What you agreed to">
          {consents.length === 0 ? (
            <p className="text-sm text-gray-600">No records yet.</p>
          ) : (
            <ul className="text-sm space-y-1">
              {consents.map((c) => (
                <li key={c.id}>
                  {when(c.createdAt)}: {consentLabel(c.type)} ({c.granted ? "agreed" : "not agreed"})
                </li>
              ))}
            </ul>
          )}
        </Section>

        <p className="text-xs text-gray-500 mt-8">
          Something wrong or missing? Email {CLINIC.privacyOfficerEmail} or call {CLINIC.phone}.
        </p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="text-lg font-semibold border-b pb-1 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Rows({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[11rem_1fr] gap-x-3 gap-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-gray-600">{k}</dt>
          <dd className="whitespace-pre-wrap break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
