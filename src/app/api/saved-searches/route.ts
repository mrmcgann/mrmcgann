import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail } from "@/lib/api";

export async function POST(req: Request) {
  const { label, query } = await req.json();
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in to save searches.", 401);
  const { count } = await db.from("saved_searches").select("id", { count: "exact", head: true }).eq("user_id", user.id);
  if ((count || 0) >= 50) return fail("You can save up to 50 searches. Delete one first.");
  const clean = Object.fromEntries(Object.entries(query || {}).filter(([k, v]) => ["cat", "q", "state", "max"].includes(k) && v));
  const { error } = await db.from("saved_searches").insert({ user_id: user.id, label: String(label).slice(0, 120), query: clean, last_notified_at: new Date().toISOString() });
  return error ? fail("Couldn't save that search.") : json({ ok: true });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  await db.from("saved_searches").delete().eq("id", id).eq("user_id", user.id);
  return json({ ok: true });
}
