import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";

// In-person inspections have been replaced by independent mobile inspections, which are
// partner leads. Old bookings stay in the database for the record.
export default async function Inspections() {
  await requireAdmin();
  redirect("/admin/leads?kind=inspection");
}
