import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { CLINIC } from "@/lib/clinic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = CLINIC.domain.replace(/\/$/, "");
  const services = await db.service.findMany({ where: { active: true }, select: { slug: true, createdAt: true } });
  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/services",
    "/about",
    "/contact",
    "/privacy",
    "/terms",
    "/book",
    "/vouchers",
    "/login",
    "/signup",
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
