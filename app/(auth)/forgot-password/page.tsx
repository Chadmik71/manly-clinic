import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-form";
import { requestPasswordReset } from "./actions";

export const metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter the email associated with your account. If we recognise it, we
          will email a link to set a new password. The link expires in 30
          minutes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm action={requestPasswordReset} />
      </CardContent>
    </Card>
  );
}
