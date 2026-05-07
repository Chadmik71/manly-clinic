import { CLINIC } from "@/lib/clinic";

/**
 * Fetches Google reviews for the clinic via the Places API (New).
 *
 * Up to 5 reviews are returned — that's a Google-side limit, not ours,
 * and applies to every consumer of this API. Cached for 6 hours so we
 * don't hit the API on every page load (Place Details — Reviews is a
 * billable SKU; the free tier covers a low-traffic site comfortably,
 * but caching keeps the cost effectively zero).
 *
 * Returns null when GOOGLE_PLACES_API_KEY is unset (so the homepage
 * renders without a Reviews section instead of erroring) or if the
 * upstream call fails for any reason.
 */

export type GoogleReview = {
  rating: number;
  text: string;
  authorName: string;
  authorPhotoUrl: string | null;
  relativeTime: string;
  publishTime: string;
};

export type GoogleReviewsData = {
  rating: number;
  totalRatings: number;
  reviews: GoogleReview[];
};

const CACHE_SECONDS = 6 * 60 * 60;

export async function getGoogleReviews(): Promise<GoogleReviewsData | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[google-reviews] GOOGLE_PLACES_API_KEY not set — Reviews section will be hidden",
      );
    }
    return null;
  }

  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(CLINIC.googlePlaceId)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "rating,userRatingCount,reviews",
      },
      next: { revalidate: CACHE_SECONDS },
    });
  } catch (err) {
    console.error("[google-reviews] fetch failed", err);
    return null;
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(
      `[google-reviews] Places API ${res.status}: ${body.slice(0, 200)}`,
    );
    return null;
  }

  type PlacesResponse = {
    rating?: number;
    userRatingCount?: number;
    reviews?: Array<{
      rating?: number;
      text?: { text?: string };
      originalText?: { text?: string };
      authorAttribution?: {
        displayName?: string;
        photoUri?: string;
      };
      relativePublishTimeDescription?: string;
      publishTime?: string;
    }>;
  };
  const data = (await res.json()) as PlacesResponse;

  const reviews: GoogleReview[] = (data.reviews ?? [])
    .map((r) => ({
      rating: r.rating ?? 0,
      text: r.text?.text ?? r.originalText?.text ?? "",
      authorName: r.authorAttribution?.displayName ?? "Anonymous",
      authorPhotoUrl: r.authorAttribution?.photoUri ?? null,
      relativeTime: r.relativePublishTimeDescription ?? "",
      publishTime: r.publishTime ?? "",
    }))
    .filter((r) => r.text.trim().length > 0);

  return {
    rating: data.rating ?? 0,
    totalRatings: data.userRatingCount ?? 0,
    reviews,
  };
}
