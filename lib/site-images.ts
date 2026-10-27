import * as React from "react";
import { db } from "@/lib/db";

const cache: <F extends (...args: never[]) => unknown>(fn: F) => F =
  (React as { cache?: <F>(fn: F) => F }).cache ?? ((fn) => fn);

type ImageSlotDef = {
  label: string;
  help: string;
  /** Public pages that show this photo; revalidated when it changes. */
  pages: readonly string[];
  defaultSrc: string;
  defaultAlt: string;
  sizeHint: string;
};

export const SITE_IMAGES = {
  homeHero: {
    label: "Homepage main photo",
    help: "The big photo behind the headline at the top of the homepage.",
    pages: ["/"],
    defaultSrc: "/hero-massage.jpg",
    defaultAlt: "Relaxing hot stone massage treatment",
    sizeHint: "Wide (landscape) photo, at least 2000 px across. The left side sits behind the text.",
  },
  homeFirstVisit: {
    label: "Homepage “first visit” photo",
    help: "Beside the “Your first visit, step by step” section on the homepage.",
    pages: ["/"],
    defaultSrc: "/home-firstvisit.jpg",
    defaultAlt: "Therapist assessing a client's posture before remedial treatment",
    sizeHint: "Landscape, 4:3 shape, at least 1200 px across.",
  },
  homeReviews: {
    label: "Homepage reviews photo",
    help: "Above the Google reviews on the homepage (only shows when reviews are loaded).",
    pages: ["/"],
    defaultSrc: "/reviews-care.jpg",
    defaultAlt: "Therapist treating a client in a calm clinic room",
    sizeHint: "Wide strip, at least 2000 px across. The middle is what shows.",
  },
  about: {
    label: "About page photo",
    help: "Beside the introduction on the About page.",
    pages: ["/about"],
    defaultSrc: "/about-clinic.jpg",
    defaultAlt: "Remedial massage therapist treating a client in a calm clinic room",
    sizeHint: "Portrait (taller than wide), 4:5 shape, at least 800 px across.",
  },
  contact: {
    label: "Contact page photo",
    help: "The strip at the top of the Contact page.",
    pages: ["/contact"],
    defaultSrc: "/contact-welcome.jpg",
    defaultAlt: "Calm massage treatment room at the clinic",
    sizeHint: "Wide strip, at least 2000 px across. The middle is what shows.",
  },
  book: {
    label: "Booking page photo",
    help: "The strip above the treatment list on the Book page (computers and tablets only).",
    pages: ["/book"],
    defaultSrc: "/book-welcome.jpg",
    defaultAlt: "Remedial therapist treating a client at the clinic",
    sizeHint: "Very wide strip, at least 2000 px across. The middle is what shows.",
  },
  vouchers: {
    label: "Gift vouchers photo",
    help: "The strip at the top of the Gift vouchers page.",
    pages: ["/vouchers"],
    defaultSrc: "/voucher-gift.jpg",
    defaultAlt: "Natural spa products — the feel of a wellness gift",
    sizeHint: "Wide strip, at least 1600 px across.",
  },
  svcTherapeutic: {
    label: "Services: Therapeutic",
    help: "Above the Therapeutic treatments on the Services page.",
    pages: ["/services"],
    defaultSrc: "/svc-therapeutic.jpg",
    defaultAlt: "Therapeutic massage treatment",
    sizeHint: "Wide strip, at least 1600 px across.",
  },
  svcRelaxation: {
    label: "Services: Relaxation",
    help: "Above the Relaxation treatments on the Services page.",
    pages: ["/services"],
    defaultSrc: "/svc-relaxation.jpg",
    defaultAlt: "Relaxation massage treatment",
    sizeHint: "Wide strip, at least 1600 px across.",
  },
  svcSpecialty: {
    label: "Services: Specialty",
    help: "Above the Specialty treatments on the Services page.",
    pages: ["/services"],
    defaultSrc: "/svc-specialty.jpg",
    defaultAlt: "Specialty massage treatment",
    sizeHint: "Wide strip, at least 1600 px across.",
  },
  svcAddOn: {
    label: "Services: Add-ons",
    help: "Above the Add-ons on the Services page.",
    pages: ["/services"],
    defaultSrc: "/svc-addon.jpg",
    defaultAlt: "Add-on massage treatment",
    sizeHint: "Wide strip, at least 1600 px across.",
  },
} as const satisfies Record<string, ImageSlotDef>;

export type SiteImageKey = keyof typeof SITE_IMAGES;
export type SiteImage = { src: string; alt: string; isCustom: boolean };
export type SiteImages = Record<SiteImageKey, SiteImage>;

export const SITE_IMAGE_ALT_MAX = 150;
export const SITE_IMAGE_MAX_BYTES = 1_500_000;

export function isSiteImageKey(k: string): k is SiteImageKey {
  return Object.prototype.hasOwnProperty.call(SITE_IMAGES, k);
}

export function siteImageKeys(): SiteImageKey[] {
  return Object.keys(SITE_IMAGES) as SiteImageKey[];
}

export function customImageSrc(key: SiteImageKey, updatedAt: Date): string {
  return `/api/site-image/${key}?v=${updatedAt.getTime()}`;
}

function defaults(): SiteImages {
  const out = {} as SiteImages;
  for (const key of siteImageKeys()) {
    out[key] = { src: SITE_IMAGES[key].defaultSrc, alt: SITE_IMAGES[key].defaultAlt, isCustom: false };
  }
  return out;
}

/**
 * Website photos with admin uploads merged over the built-in files. Never
 * loads the image bytes; on any DB error the built-in photos are used.
 */
export const getSiteImages = cache(async (): Promise<SiteImages> => {
  const images = defaults();
  try {
    const rows = await db.siteImage.findMany({ select: { key: true, alt: true, updatedAt: true } });
    for (const row of rows) {
      if (!isSiteImageKey(row.key)) continue;
      images[row.key] = {
        src: customImageSrc(row.key, row.updatedAt),
        alt: row.alt ?? SITE_IMAGES[row.key].defaultAlt,
        isCustom: true,
      };
    }
  } catch (err) {
    console.error("[site-images] falling back to defaults", err);
  }
  return images;
});

export type ImageInfo = { mime: "image/jpeg" | "image/png" | "image/webp"; width: number; height: number };

/** Identifies a JPEG, PNG or WebP by its magic bytes and reads its pixel size. Null for anything else. */
export function readImageInfo(b: Uint8Array): ImageInfo | null {
  const u16be = (i: number) => (b[i] << 8) | b[i + 1];
  const u32be = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const ascii = (i: number, s: string) => [...s].every((c, j) => b[i + j] === c.charCodeAt(0));
  const sized = (mime: ImageInfo["mime"], width: number, height: number): ImageInfo | null =>
    width > 0 && height > 0 ? { mime, width, height } : null;

  if (b.length >= 24 && b[0] === 0x89 && ascii(1, "PNG\r\n\x1a\n") && ascii(12, "IHDR")) {
    return sized("image/png", u32be(16), u32be(20));
  }

  if (b.length >= 30 && ascii(0, "RIFF") && ascii(8, "WEBP")) {
    if (ascii(12, "VP8 ") && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      return sized("image/webp", (b[26] | (b[27] << 8)) & 0x3fff, (b[28] | (b[29] << 8)) & 0x3fff);
    }
    if (ascii(12, "VP8L") && b[20] === 0x2f) {
      const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
      return sized("image/webp", (bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    if (ascii(12, "VP8X")) {
      return sized("image/webp", (b[24] | (b[25] << 8) | (b[26] << 16)) + 1, (b[27] | (b[28] << 8) | (b[29] << 16)) + 1);
    }
    return null;
  }

  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return sized("image/jpeg", u16be(i + 7), u16be(i + 5));
      if (marker === 0xd9 || marker === 0xda) return null;
      i += 2 + u16be(i + 2);
    }
  }
  return null;
}
