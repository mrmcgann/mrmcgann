import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail, friendly } from "@/lib/api";
import { kickOutbox } from "@/lib/notify";

// One database call per bid: the engine checks, bids, extends the clock, queues the
// outbid alert and broadcasts the new price to everyone watching, atomically.
export async function POST(req: Request) {
  const { lotId, max } = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in to bid.", 401);
  const amount = Math.round(Number(max));
  if (!Number.isFinite(amount) || amount <= 0) return fail("Enter a whole-dollar amount.");
  const { data, error } = await db.rpc("place_bid", { p_lot: Number(lotId), p_max: amount });
  if (error) return fail(friendly(error.message), error.message.includes("terms_outdated") ? 409 : 400);
  const r = data as { outbid_user: string | null };
  if (r.outbid_user && r.outbid_user !== user.id) kickOutbox();
  return json(data);
}
