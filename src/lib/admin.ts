import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export async function requireAdmin() {
  const s = await getSession();
  if (!s.user) redirect("/signin?next=/admin");
  if (s.profile?.role !== "admin") redirect("/");
  return s;
}
