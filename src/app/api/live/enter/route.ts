import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail, friendly } from "@/lib/api";

// A member enters a live auction room: they've read the auction's conditions (src/lib/conditions.ts) and ticked to
// accept them. enter_sale records who, when and which version of the terms; bids in the room need it (place_bid).
export async function POST(req: Request) {
  const { saleId } = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in to bid in the room.", 401);
  const sale = Number(saleId);
  if (!Number.isSafeInteger(sale) || sale <= 0) return fail("We couldn't find that auction.");
  const { data, error } = await db.rpc("enter_sale", { p_sale: sale });
  if (error) return fail(error.message.includes("sale_not_found") ? "We couldn't find that auction." : friendly(error.message));
  return json({ entered_at: data });
}
