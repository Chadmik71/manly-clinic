import { auth } from "@/lib/auth";
import { StaffShell } from "@/components/staff-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "My Account" };

export default async function AccountPage() {
  const session = (await auth())!;
  return (
    <StaffShell user={session.user} topbar={<span className="text-foreground font-medium">My Account</span>}>
      <div className="p-4 max-w-xl space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Account details</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <div><span className="text-muted-foreground">Name: </span>{session.user.name}</div>
            <div><span className="text-muted-foreground">Email: </span>{session.user.email}</div>
            <div><span className="text-muted-foreground">Role: </span>{session.user.role}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
      </div>
    </StaffShell>
  );
}
