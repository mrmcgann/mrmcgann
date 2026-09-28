import { supabaseServer } from "@/lib/supabase/server";
import { json, fail } from "@/lib/api";

export async function POST(req: Request) {
  const { label, query } = await req.json();
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return fail("Sign in to save searches.", 401);
  const clean = Object.fromEntries(Object.entries(query || {}).filter(([k, v]) => ["cat", "q", "state", "max"].includes(k) && v));
  const { error } = await db.from("saved_searches").insert({ user_id: user.id, label: String(label).slice(0, 120), query: clean, last_notified_at: new Date().toISOString() });
  return error ? fail("Couldn't save that search.") : json({ ok: true });
}

export async function DELETE(req: Request) {
  const { id } = await req.json();
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return fail("Sign in first.", 401);
  await db.from("saved_searches").delete().eq("id", id).eq("user_id", user.id);
  return json({ ok: true });
}
