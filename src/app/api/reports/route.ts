import { allow } from "@/lib/ratelimit";
import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail } from "@/lib/api";

export async function POST(req: Request) {
  const { lotId, type, details } = await req.json();
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  if (!(await allow(`report:${user.id}`, 20, 3600))) return fail("Too many reports. Please call us.", 429);
  await db.from("reports").insert({ lot_id: lotId, user_id: user.id, type: String(type).slice(0, 80), details: String(details || "").slice(0, 4000) });
  return json({ ok: true });
}
