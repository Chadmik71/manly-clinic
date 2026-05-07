import { Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getGoogleReviews } from "@/lib/google-reviews";

/**
 * Server component that renders up to 5 Google reviews from the clinic's
 * Business Profile. Renders nothing when the API key is unset or the
 * upstream call fails — homepage degrades gracefully.
 */
export async function GoogleReviews() {
  const data = await getGoogleReviews();
  if (!data || data.reviews.length === 0) return null;

  return (
    <section className="container py-16">
      <div className="text-center mb-10">
        <h2 className="text-2xl md:text-3xl font-bold mb-2">
          What our clients say
        </h2>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={
                  i < Math.round(data.rating)
                    ? "h-4 w-4 fill-amber-400 text-amber-400"
                    : "h-4 w-4 text-muted-foreground/40"
                }
                aria-hidden="true"
              />
            ))}
          </span>
          <span className="font-medium text-foreground">
            {data.rating.toFixed(1)}
          </span>
          <span>· {data.totalRatings} Google reviews</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {data.reviews.map((r, i) => (
          <Card key={i} className="flex flex-col">
            <CardContent className="pt-6 flex flex-col h-full">
              <div className="flex items-center gap-3 mb-3">
                {r.authorPhotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.authorPhotoUrl}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-muted grid place-items-center text-sm font-medium">
                    {r.authorName.slice(0, 1).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{r.authorName}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.relativeTime}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-0.5 mb-2" aria-label={`${r.rating} out of 5 stars`}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={
                      i < r.rating
                        ? "h-3.5 w-3.5 fill-amber-400 text-amber-400"
                        : "h-3.5 w-3.5 text-muted-foreground/40"
                    }
                    aria-hidden="true"
                  />
                ))}
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-line line-clamp-6">
                {r.text}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Reviews shown are pulled live from Google. Up to 5 most-recent are
        displayed — the Google API limits the count.
      </p>
    </section>
  );
}
