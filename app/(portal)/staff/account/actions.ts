"use server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { hash, compare } from "bcryptjs";

export async function changePassword(formData: FormData) {
  const session = await auth();
  if (!session?.user?.email) throw new Error("Not authenticated.");

  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirmPassword = formData.get("confirmPassword") as string;

  if (!currentPassword || !newPassword || !confirmPassword) {
    throw new Error("All fields are required.");
  }
  if (newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters long.");
  }
  if (newPassword !== confirmPassword) {
    throw new Error("New password and confirmation do not match.");
  }
  if (newPassword === currentPassword) {
    throw new Error("New password must be different from your current password.");
  }

  const user = await db.user.findUnique({ where: { email: session.user.email } });
  if (!user) throw new Error("User not found.");

  const valid = await compare(currentPassword, user.passwordHash);
  if (!valid) throw new Error("Current password is incorrect.");

  const newHash = await hash(newPassword, 10);
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: newHash },
  });

  return { success: true };
}
