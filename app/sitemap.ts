export const dynamic = 'force-dynamic';

import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { CLINIC } from "@/lib/clinic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = CLINIC.domain.replace(/\/$/, "");

  // Gracefully handle DB failure during build
  let services: { slug: string; createdAt: Date }[] = [];
  try {
    services = await db.service.findMany({
      where: { active: true },
      select: { slug: true, createdAt: true },
    });
  } catch {
    services = [];
  }

  const now = new Date();

  // Public-facing routes only. /login and /signup are intentionally
  // excluded — auth entry pages have no SEO value and just dilute
  // the sitemap. Same reason robots.ts could optionally disallow them.
  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/services",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    "/book",
    "/vouchers",
  ].map((path) => ({
    url: `${base}${path || "/"}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.7,
  }));

  const serviceRoutes: MetadataRoute.Sitemap = services.map((s) => ({
    url: `${base}/book?service=${s.slug}`,
    lastModified: s.createdAt,
    changeFrequency: "monthly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...serviceRoutes];
}
