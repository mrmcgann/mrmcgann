import { supabaseServer } from "@/lib/supabase/server";
import { json, fail, friendly } from "@/lib/api";

export async function POST(req: Request) {
  const { lotId, amount } = await req.json();
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return fail("Sign in to make an offer.", 401);
  const { data, error } = await db.rpc("make_offer", { p_lot: Number(lotId), p_amount: Math.round(Number(amount)) });
  if (error) return fail(friendly(error.message));
  return json({ offerId: data });
}
