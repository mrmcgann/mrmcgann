import { supabaseServer } from "@/lib/supabase/server";
import { json, fail } from "@/lib/api";

export async function POST(req: Request) {
  const { lotId, day, time } = await req.json();
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return fail("Sign in first.", 401);
  if (!day || !time) return fail("Choose a day and time.");
  const { error } = await db.from("inspections").insert({ lot_id: lotId, user_id: user.id, preferred_day: String(day), preferred_time: String(time) });
  if (error) return fail("Finish verifying your account (mobile, card and ID) before booking an inspection.");
  return json({ ok: true });
}
