import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-form";
import { resetPassword } from "./actions";
import { verifyResetToken } from "@/lib/reset-token";

export const metadata = { title: "Set a new password" };

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const sp = await searchParams;
  const token = sp.token ?? "";
  const result = token ? verifyResetToken(token) : { error: "Missing token." };

  if ("error" in result) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>This link can&apos;t be used</CardTitle>
          <CardDescription>{result.error}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Reset links are valid for 30 minutes and can only be used once. If
            yours has expired, just ask for a new one.
          </p>
          <p>
            <Link
              href="/forgot-password"
              className="text-primary hover:underline"
            >
              Request a new reset link
            </Link>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>
          Choose a new password for your account. You&apos;ll be signed in
          automatically once it&apos;s set.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm action={resetPassword} token={token} />
      </CardContent>
    </Card>
  );
}
