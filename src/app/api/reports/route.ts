import { supabaseServer } from "@/lib/supabase/server";
import { json, fail } from "@/lib/api";

export async function POST(req: Request) {
  const { lotId, type, details } = await req.json();
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return fail("Sign in first.", 401);
  await db.from("reports").insert({ lot_id: lotId, user_id: user.id, type: String(type).slice(0, 80), details: String(details || "").slice(0, 4000) });
  return json({ ok: true });
}
