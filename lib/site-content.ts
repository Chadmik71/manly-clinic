import * as React from "react";
import { z } from "zod";
import { db } from "@/lib/db";
import { CLINIC } from "@/lib/clinic";

// Next's server runtime bundles a React with cache(); plain-Node scripts (tsx)
// load the installed React 18, which lacks it, so fall back to no memoising.
const cache: <F extends (...args: never[]) => unknown>(fn: F) => F =
  (React as { cache?: <F>(fn: F) => F }).cache ?? ((fn) => fn);

export type FaqItem = { q: string; a: string };

type ValueByKind = {
  text: string;
  longtext: string;
  faq: FaqItem[];
  toggle: boolean;
};
export type FieldKind = keyof ValueByKind;

export const SITE_CONTENT_GROUPS = [
  "Homepage",
  "FAQ",
  "About page",
  "Clinic details",
  "Notice banner",
] as const;
export type SiteContentGroup = (typeof SITE_CONTENT_GROUPS)[number];

type FieldDef<K extends FieldKind> = {
  label: string;
  help: string;
  group: SiteContentGroup;
  kind: K;
  maxLength: number;
  default: ValueByKind[K];
  allowEmpty?: boolean;
  check?: { test: (v: string) => boolean; message: string };
};

const AU_STATES = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "ACT", "NT"];

/** Strips formatting from an Australian phone number. Null when it isn't one. */
function phoneDigits(raw: string): string | null {
  const s = raw.replace(/[\s\-()]/g, "");
  if (/^0[2-478]\d{8}$/.test(s)) return s;
  if (/^\+61[2-478]\d{8}$/.test(s)) return "0" + s.slice(3);
  if (/^61[2-478]\d{8}$/.test(s)) return "0" + s.slice(2);
  if (/^1[38]00\d{6}$/.test(s) || /^13\d{4}$/.test(s)) return s;
  return null;
}

/** tel:-ready form: 0412 822 226 -> +61412822226; 1300/13 numbers stay local. */
export function phoneToE164(raw: string): string {
  const d = phoneDigits(raw) ?? raw.replace(/[^\d+]/g, "");
  return d.startsWith("0") ? "+61" + d.slice(1) : d;
}

const FAQ_DEFAULT: FaqItem[] = [
  {
    q: "Do I need a referral to book?",
    a: "No — you can book any of our treatments directly online or by phone. A referral is only needed if you’re claiming through Medicare on a chronic disease management plan, or for some workers compensation and DVA bookings. Standard private health-fund rebates for remedial massage do not require a referral.",
  },
  {
    q: "Which health funds do you accept?",
    a: "We’re HiCAPS-enabled and process on-the-spot rebates for all major Australian health funds — including Bupa, Medibank, HCF, NIB and most others. Rebate amounts depend on your specific policy, level of cover and remaining annual limit. Please bring your physical or digital health-fund card to your appointment.",
  },
  {
    q: "How long is a typical session?",
    a: "Treatments range from 10 minutes (Head, Neck and Shoulders add-on) up to 90 minutes (extended remedial or hot stone). Most first-time clients book a 60-minute remedial massage, which gives time for assessment, treatment and post-care advice. Booking durations include treatment time only; we allow a buffer between clients for room turnover.",
  },
  {
    q: "What should I wear?",
    a: "Please keep underwear on at all times during your treatment — this is a strict clinic policy. For oil-based and remedial massages, you’ll be draped with towels throughout, with only the area being worked on exposed. For Thai massage, you’ll stay fully clothed in loose-fitting attire. We recommend leaving valuables and jewellery at home.",
  },
  {
    q: "Can I claim on the spot with HiCAPS?",
    a: "Yes — we process health-fund rebates on the spot via HiCAPS for eligible treatments such as remedial massage. You only pay the gap between our fee and your fund’s rebate. Please bring your fund card to the appointment. Note that relaxation-only services are generally not health-fund eligible.",
  },
  {
    q: "How do I cancel or reschedule?",
    a: "You can reschedule or cancel through your client portal at manlyremedialthai.com.au, or by replying to your confirmation email. Cancellations with at least 1 hour’s notice are free of charge. Cancellations within 1 hour of the start time, no-shows, or arriving more than 10 minutes late without calling attract a 50% fee, per our published cancellation policy.",
  },
];

export const FAQ_MAX_ITEMS = 20;
export const FAQ_QUESTION_MAX = 200;

export const SITE_CONTENT = {
  heroHeadline: {
    label: "Main headline",
    help: "The big heading at the top of the homepage. Also used as the homepage description in Google results.",
    group: "Homepage",
    kind: "text",
    maxLength: 120,
    default: CLINIC.tagline,
  },
  heroIntro: {
    label: "Intro paragraph",
    help: "The paragraph under the main headline.",
    group: "Homepage",
    kind: "longtext",
    maxLength: 400,
    default:
      "Qualified therapists. Clinical assessment. Health-fund eligible treatments. Book online in under a minute — your records, your control.",
  },
  treatmentsIntro: {
    label: "Treatments section intro",
    help: "The line under the “Treatments” heading.",
    group: "Homepage",
    kind: "text",
    maxLength: 200,
    default: "Clinical and relaxation modalities, all delivered by qualified therapists.",
  },
  firstVisitIntro: {
    label: "First visit section intro",
    help: "The line under “Your first visit, step by step”.",
    group: "Homepage",
    kind: "text",
    maxLength: 200,
    default: "New to the clinic? Here’s exactly what to expect — no surprises.",
  },
  ctaHeading: {
    label: "Bottom banner heading",
    help: "The heading in the coloured box at the bottom of the homepage.",
    group: "Homepage",
    kind: "text",
    maxLength: 80,
    default: "Ready to book?",
  },
  ctaBody: {
    label: "Bottom banner text",
    help: "The text under that heading.",
    group: "Homepage",
    kind: "longtext",
    maxLength: 300,
    default:
      "Online booking is open 24/7. Your intake form and consent are handled securely before your first visit.",
  },
  faqs: {
    label: "Frequently asked questions",
    help: "Shown on the homepage, and given to Google as FAQ results.",
    group: "FAQ",
    kind: "faq",
    maxLength: 2000,
    default: FAQ_DEFAULT,
  },
  aboutIntro: {
    label: "Intro paragraph",
    help: "The large first paragraph on the About page.",
    group: "About page",
    kind: "longtext",
    maxLength: 800,
    default:
      "A clinical remedial therapy practice in Manly. Our therapists combine assessment-led treatment plans with the relief of soft-tissue work — for chronic pain, sports injury, posture rehabilitation, and pregnancy wellbeing.",
  },
  aboutPrivacy: {
    label: "Second paragraph",
    help: "The paragraph about how client information is looked after.",
    group: "About page",
    kind: "longtext",
    maxLength: 800,
    default:
      "We treat your information the same way a medical practice would. Health intake forms are stored encrypted, accessed only by your treating therapist, and disclosed only with your written consent — consistent with the Australian Privacy Principles under the Privacy Act 1988 (Cth).",
  },
  hours: {
    label: "Opening hours",
    help: "Shown on the homepage, contact page and footer. This is wording only: it does not change which times can be booked.",
    group: "Clinic details",
    kind: "text",
    maxLength: 80,
    default: CLINIC.hours,
  },
  phone: {
    label: "Phone number",
    help: "Shown on the website, with tap-to-call. Invoices and emails keep the built-in number.",
    group: "Clinic details",
    kind: "text",
    maxLength: 20,
    default: CLINIC.phone,
    check: {
      test: (v) => phoneDigits(v) !== null,
      message: "Enter an Australian phone number, e.g. 0412 822 226 or 02 9977 1234.",
    },
  },
  email: {
    label: "Email address",
    help: "Shown on the website. Invoices and emails keep the built-in address.",
    group: "Clinic details",
    kind: "text",
    maxLength: 100,
    default: CLINIC.email,
    check: {
      test: (v) => z.string().email().safeParse(v).success,
      message: "Enter a valid email address.",
    },
  },
  addressLine1: {
    label: "Street address",
    help: "e.g. Shop 2, 31 Belgrave St",
    group: "Clinic details",
    kind: "text",
    maxLength: 100,
    default: CLINIC.address.line1,
  },
  suburb: {
    label: "Suburb",
    help: "",
    group: "Clinic details",
    kind: "text",
    maxLength: 40,
    default: CLINIC.address.suburb,
  },
  state: {
    label: "State",
    help: "e.g. NSW",
    group: "Clinic details",
    kind: "text",
    maxLength: 3,
    default: CLINIC.address.state,
    check: {
      test: (v) => AU_STATES.includes(v.toUpperCase()),
      message: `Enter one of ${AU_STATES.join(", ")}.`,
    },
  },
  postcode: {
    label: "Postcode",
    help: "",
    group: "Clinic details",
    kind: "text",
    maxLength: 4,
    default: CLINIC.address.postcode,
    check: { test: (v) => /^\d{4}$/.test(v), message: "A postcode is 4 digits." },
  },
  bannerEnabled: {
    label: "Show the notice banner",
    help: "When on, a thin strip with the message below appears at the top of every page of the public website.",
    group: "Notice banner",
    kind: "toggle",
    maxLength: 5,
    default: false,
  },
  bannerMessage: {
    label: "Banner message",
    help: "e.g. “Closed Monday 26 January for Australia Day.”",
    group: "Notice banner",
    kind: "text",
    maxLength: 160,
    default: "",
    allowEmpty: true,
  },
} as const satisfies Record<string, FieldDef<FieldKind>>;

export type SiteContentKey = keyof typeof SITE_CONTENT;
type ValueOf<K extends SiteContentKey> = ValueByKind[(typeof SITE_CONTENT)[K]["kind"]];
export type SiteContentValues = { -readonly [K in SiteContentKey]: ValueOf<K> };

export type ClinicContact = {
  phone: string;
  phoneE164: string;
  email: string;
  hours: string;
  address: { line1: string; suburb: string; state: string; postcode: string };
};

export type SiteContent = SiteContentValues & { clinic: ClinicContact };

export function isSiteContentKey(k: string): k is SiteContentKey {
  return Object.prototype.hasOwnProperty.call(SITE_CONTENT, k);
}

function fieldSchema(def: FieldDef<FieldKind>): z.ZodType<unknown> {
  switch (def.kind) {
    case "toggle":
      return z.boolean();
    case "faq":
      return z
        .array(
          z.object({
            q: z.string().trim().min(1, "Every question needs text.").max(FAQ_QUESTION_MAX),
            a: z.string().trim().min(1, "Every answer needs text.").max(def.maxLength),
          }),
        )
        .min(1, "Keep at least one question.")
        .max(FAQ_MAX_ITEMS, `At most ${FAQ_MAX_ITEMS} questions.`);
    default: {
      const base = z.string().trim().max(def.maxLength, `At most ${def.maxLength} characters.`);
      const sized = def.allowEmpty ? base : base.min(1, "This can't be empty.");
      const check = def.check;
      return check ? sized.refine(check.test, check.message) : sized;
    }
  }
}

/** Validates an edited value. Used by the admin save action. */
export function parseSiteContentValue<K extends SiteContentKey>(
  key: K,
  input: unknown,
): { ok: true; value: ValueOf<K> } | { ok: false; error: string } {
  const def = SITE_CONTENT[key] as FieldDef<FieldKind>;
  const r = fieldSchema(def).safeParse(input);
  if (!r.success) return { ok: false, error: r.error.issues[0]?.message ?? "Invalid value." };
  const value = key === "state" ? String(r.data).toUpperCase() : r.data;
  return { ok: true, value: value as ValueOf<K> };
}

export function serializeSiteContentValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function deserialize(kind: FieldKind, raw: string): unknown {
  if (kind === "text" || kind === "longtext") return raw;
  return JSON.parse(raw);
}

/** Decodes a stored row, or null when it no longer passes validation. */
export function decodeSiteContentRow<K extends SiteContentKey>(key: K, raw: string): ValueOf<K> | null {
  try {
    const r = parseSiteContentValue(key, deserialize(SITE_CONTENT[key].kind, raw));
    return r.ok ? r.value : null;
  } catch {
    return null;
  }
}

function defaults(): SiteContentValues {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(SITE_CONTENT) as SiteContentKey[]) {
    out[key] = SITE_CONTENT[key].default;
  }
  return out as SiteContentValues;
}

function withClinic(v: SiteContentValues): SiteContent {
  return {
    ...v,
    clinic: {
      phone: v.phone,
      phoneE164: phoneToE164(v.phone),
      email: v.email,
      hours: v.hours,
      address: { line1: v.addressLine1, suburb: v.suburb, state: v.state, postcode: v.postcode },
    },
  };
}

/**
 * Website wording with admin edits merged over the built-in defaults. Any
 * missing, invalid or unreadable value falls back to its default, so the
 * public site never fails because of this.
 */
export const getSiteContent = cache(async (): Promise<SiteContent> => {
  const values = defaults();
  try {
    const rows = await db.siteContent.findMany({ select: { key: true, value: true } });
    const out = values as Record<string, unknown>;
    for (const row of rows) {
      if (!isSiteContentKey(row.key)) continue;
      const decoded = decodeSiteContentRow(row.key, row.value);
      if (decoded !== null) out[row.key] = decoded;
    }
  } catch (err) {
    console.error("[site-content] falling back to defaults", err);
  }
  return withClinic(values);
});
