import { supabaseServer } from "@/lib/supabase/server";
import { json, fail, friendly } from "@/lib/api";
import { notify } from "@/lib/notify";
import { money } from "@/lib/format";

export async function POST(req: Request) {
  const { lotId, max } = await req.json();
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return fail("Sign in to bid.", 401);
  const { data, error } = await db.rpc("place_bid", { p_lot: Number(lotId), p_max: Math.round(Number(max)) });
  if (error) return fail(friendly(error.message));
  const r = data as { status: string; current_bid: number; ends_at: string; extended: boolean; outbid_user: string | null };
  // Tell whoever lost the lead (not the person bidding right now).
  if (r.outbid_user && r.outbid_user !== user.id) {
    const { data: lot } = await db.from("lots").select("title").eq("id", lotId).single();
    await notify(r.outbid_user, "outbid", `You've been outbid on the ${lot?.title}`, `The current bid is ${money(r.current_bid)}. Raise your maximum to get back in front.`, `/lot/${lotId}`).catch(() => {});
  }
  return json(r);
}
