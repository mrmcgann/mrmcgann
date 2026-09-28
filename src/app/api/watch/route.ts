import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail } from "@/lib/api";

export async function POST(req: Request) {
  const { lotId, on, remind } = await req.json();
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in to use your watchlist.", 401);
  if (typeof remind === "boolean") {
    await db.from("watchlist").update({ remind }).eq("user_id", user.id).eq("lot_id", lotId);
    return json({ ok: true });
  }
  if (on) await db.from("watchlist").upsert({ user_id: user.id, lot_id: lotId });
  else await db.from("watchlist").delete().eq("user_id", user.id).eq("lot_id", lotId);
  return json({ ok: true });
}
