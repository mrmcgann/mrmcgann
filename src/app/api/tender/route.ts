import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail, friendly } from "@/lib/api";

// Take a tender back before the tender closes (putting one in or changing it goes through /api/bid).
export async function DELETE(req: Request) {
  const { lotId } = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in to continue.", 401);
  const { data, error } = await db.rpc("withdraw_tender", { p_lot: Number(lotId) });
  if (error) return fail(friendly(error.message));
  return json({ ok: true, tender_count: data });
}
