import { db } from "@/lib/db";
import { CLINIC } from "@/lib/clinic";
import { categoryLabel } from "@/lib/utils";
import { getSiteContent } from "@/lib/site-content";

/**
 * Plain-text business summary served at /llms.txt.
 *
 * An emerging (not-yet-standardised) convention: a clean, prose summary of
 * the site that AI assistants can ingest without wading through HTML. Built
 * from CLINIC, the editable site content and the live service catalogue so it can't drift out of date.
 * Cached for a day; degrades gracefully if the DB is unreachable.
 */

export const revalidate = 86400;

export async function GET() {
  let serviceLines = "";
  try {
    const services = await db.service.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
      select: { name: true, category: true, description: true },
    });
    serviceLines = services
      .map(
        (s) => `- ${s.name} (${categoryLabel(s.category)}): ${s.description}`,
      )
      .join("\n");
  } catch {
    serviceLines = "- See /services for the current treatment list.";
  }

  const content = await getSiteContent();
  const { clinic } = content;
  const addr = `${clinic.address.line1}, ${clinic.address.suburb} ${clinic.address.state} ${clinic.address.postcode}`;
  const base = CLINIC.domain.replace(/\/$/, "");

  const body = `# ${CLINIC.name}

> ${content.heroHeadline}

${CLINIC.name} is a remedial and Thai massage clinic in ${clinic.address.suburb}, on Sydney's Northern Beaches (${clinic.address.state}, Australia). Treatments are delivered by qualified remedial therapists. Health-fund rebates are available on the spot via HiCAPS for eligible remedial sessions.

## Location & contact
- Address: ${addr}
- Phone: ${clinic.phone}
- Email: ${clinic.email}
- Hours: ${clinic.hours}
- Area served: Manly, Northern Beaches, Sydney

## Services
${serviceLines}

## Booking
- Book online 24/7 at ${base}/book
- View services and pricing at ${base}/services

## Pages
- Home: ${base}/
- Services & pricing: ${base}/services
- About: ${base}/about
- Contact: ${base}/contact
- Gift vouchers: ${base}/vouchers
- Book: ${base}/book
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
