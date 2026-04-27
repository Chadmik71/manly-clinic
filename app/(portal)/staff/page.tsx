import { redirect } from "next/navigation";

// /staff lands directly on the calendar, matching Receptioner's "bookings is the calendar".
export default function StaffIndex() {
  redirect("/staff/schedule");
}
