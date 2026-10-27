"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  SITE_CONTENT,
  decodeSiteContentRow,
  isSiteContentKey,
  parseSiteContentValue,
  serializeSiteContentValue,
  type SiteContentKey,
} from "@/lib/site-content";
import {
  SITE_IMAGES,
  SITE_IMAGE_ALT_MAX,
  SITE_IMAGE_MAX_BYTES,
  isSiteImageKey,
  readImageInfo,
  type SiteImageKey,
} from "@/lib/site-images";

export type SiteContentResult = { ok: true } | { ok: false; error: string };

const AUDIT_VALUE_MAX = 500;

function forAudit(serialized: string): string {
  return serialized.length > AUDIT_VALUE_MAX ? serialized.slice(0, AUDIT_VALUE_MAX) + "…" : serialized;
}

async function currentSerialized(key: SiteContentKey): Promise<{ row: boolean; value: string }> {
  const row = await db.siteContent.findUnique({ where: { key } });
  const decoded = row ? decodeSiteContentRow(key, row.value) : null;
  return {
    row: !!row,
    value: serializeSiteContentValue(decoded ?? SITE_CONTENT[key].default),
  };
}

export async function saveSiteContent(key: string, input: unknown): Promise<SiteContentResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return { ok: false, error: "Only an admin can change the website." };
  if (!isSiteContentKey(key)) return { ok: false, error: "Unknown field." };

  const parsed = parseSiteContentValue(key, input);
  if (!parsed.ok) return parsed;

  const next = serializeSiteContentValue(parsed.value);
  const before = await currentSerialized(key);
  if (next === before.value) return { ok: true };

  // Saving the original wording is the same as "Back to original".
  if (next === serializeSiteContentValue(SITE_CONTENT[key].default)) {
    await db.siteContent.deleteMany({ where: { key } });
  } else {
    const updatedBy = session.user.name || session.user.email;
    await db.siteContent.upsert({
      where: { key },
      create: { key, value: next, updatedBy },
      update: { value: next, updatedBy },
    });
  }

  await audit({
    userId: session.user.id,
    action: "UPDATE_SITE_CONTENT",
    resource: `SiteContent:${key}`,
    metadata: { key, label: SITE_CONTENT[key].label, old: forAudit(before.value), new: forAudit(next) },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function resetSiteContent(key: string): Promise<SiteContentResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return { ok: false, error: "Only an admin can change the website." };
  if (!isSiteContentKey(key)) return { ok: false, error: "Unknown field." };

  const before = await currentSerialized(key);
  if (!before.row) return { ok: true };
  await db.siteContent.deleteMany({ where: { key } });

  await audit({
    userId: session.user.id,
    action: "RESET_SITE_CONTENT",
    resource: `SiteContent:${key}`,
    metadata: {
      key,
      label: SITE_CONTENT[key].label,
      old: forAudit(before.value),
      new: forAudit(serializeSiteContentValue(SITE_CONTENT[key].default)),
    },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

function revalidateImagePages(key: SiteImageKey) {
  for (const page of SITE_IMAGES[key].pages) revalidatePath(page);
  revalidatePath("/staff/website");
}

export async function saveSiteImage(form: FormData): Promise<SiteContentResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return { ok: false, error: "Only an admin can change the website." };
  const key = String(form.get("key") ?? "");
  if (!isSiteImageKey(key)) return { ok: false, error: "Unknown photo." };

  const altInput = String(form.get("alt") ?? "").trim();
  if (altInput.length > SITE_IMAGE_ALT_MAX) {
    return { ok: false, error: `The description can be at most ${SITE_IMAGE_ALT_MAX} characters.` };
  }
  const alt = altInput === "" || altInput === SITE_IMAGES[key].defaultAlt ? null : altInput;
  const updatedBy = session.user.name || session.user.email;
  const file = form.get("file");

  if (!(file instanceof File) || file.size === 0) {
    const existing = await db.siteImage.findUnique({ where: { key }, select: { alt: true } });
    if (!existing) return { ok: false, error: "Choose a photo first." };
    if (existing.alt === alt) return { ok: true };
    await db.siteImage.update({ where: { key }, data: { alt, updatedBy } });
    await audit({
      userId: session.user.id,
      action: "UPDATE_SITE_IMAGE",
      resource: `SiteImage:${key}`,
      metadata: { slot: key, altOnly: true },
    });
    revalidateImagePages(key);
    return { ok: true };
  }

  if (file.size > SITE_IMAGE_MAX_BYTES) return { ok: false, error: "That photo is too large (over 1.5 MB)." };
  const data = Buffer.from(await file.arrayBuffer());
  const info = readImageInfo(data);
  if (!info) return { ok: false, error: "That file isn't a JPEG, PNG or WebP photo." };

  const fields = { data, mime: info.mime, width: info.width, height: info.height, alt, updatedBy };
  await db.siteImage.upsert({ where: { key }, create: { key, ...fields }, update: fields });
  await audit({
    userId: session.user.id,
    action: "UPDATE_SITE_IMAGE",
    resource: `SiteImage:${key}`,
    metadata: { slot: key, bytes: data.length, width: info.width, height: info.height },
  });
  revalidateImagePages(key);
  return { ok: true };
}

export async function resetSiteImage(key: string): Promise<SiteContentResult> {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") return { ok: false, error: "Only an admin can change the website." };
  if (!isSiteImageKey(key)) return { ok: false, error: "Unknown photo." };

  const { count } = await db.siteImage.deleteMany({ where: { key } });
  if (count === 0) return { ok: true };
  await audit({
    userId: session.user.id,
    action: "RESET_SITE_IMAGE",
    resource: `SiteImage:${key}`,
    metadata: { slot: key },
  });
  revalidateImagePages(key);
  return { ok: true };
}
