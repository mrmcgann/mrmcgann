import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail, friendly } from "@/lib/api";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const { error } = await db.rpc("cancel_deposit_withdrawal", { p_id: String(b.id || "") });
  if (error) return fail(friendly(error.message));
  return json({ ok: true });
}
