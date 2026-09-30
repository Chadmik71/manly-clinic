import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MagicSignIn } from "./magic-sign-in";

export const metadata = { title: "Sign in" };

/** Landing page for the one-tap email sign-in link. */
export default function MagicLinkPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Tap the button to finish signing in. No password needed.</CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense>
          <MagicSignIn />
        </Suspense>
      </CardContent>
    </Card>
  );
}
