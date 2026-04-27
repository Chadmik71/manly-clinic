"use server";
import { db } from "@/lib/db";
import { hash } from "bcryptjs";
import { revalidatePath } from "next/cache";

export async function addTherapist(formData: FormData) {
  const name = formData.get("name") as string;
  const email = (formData.get("email") as string).toLowerCase().trim();
  const phone = formData.get("phone") as string;
  const password = formData.get("password") as string;
  const bio = formData.get("bio") as string;
  const qualifications = formData.get("qualifications") as string;
  const providerNumber = formData.get("providerNumber") as string;
  const associationName = formData.get("associationName") as string;

  if (!name || !email || !password) throw new Error("Name, email and password are required.");

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) throw new Error("A user with this email already exists.");

  const passwordHash = await hash(password, 10);

  const user = await db.user.create({
    data: { name, email, phone: phone || null, role: "STAFF", passwordHash },
  });

  await db.therapist.create({
    data: {
      userId: user.id,
      active: true,
      bio: bio || null,
      qualifications: qualifications || null,
      providerNumber: providerNumber || null,
      associationName: associationName || null,
      availability: {
        create: [1,2,3,4,5,6].map((day) => ({
          dayOfWeek: day,
          startMin: 9 * 60,
          endMin: 20 * 60 + 30,
        })),
      },
    },
  });

  revalidatePath("/staff/therapists");
}
