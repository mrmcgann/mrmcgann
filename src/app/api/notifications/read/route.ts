import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail } from "@/lib/api";

export async function POST() {
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  await db.rpc("mark_notifications_read");
  return json({ ok: true });
}
