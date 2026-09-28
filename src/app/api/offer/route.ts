import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail, friendly } from "@/lib/api";
import { kickOutbox } from "@/lib/notify";

export async function POST(req: Request) {
  const { lotId, amount } = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in to make an offer.", 401);
  const { data, error } = await db.rpc("make_offer", { p_lot: Number(lotId), p_amount: Math.round(Number(amount)) });
  if (error) return fail(friendly(error.message), error.message.includes("terms_outdated") ? 409 : 400);
  kickOutbox();
  return json({ offerId: data });
}
