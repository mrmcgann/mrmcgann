import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { kickOutbox } from "@/lib/notify";
import { allow } from "@/lib/ratelimit";
import { json, fail, friendly } from "@/lib/api";

// The seller's written agreement to sell a vehicle that didn't sell at the auction (migration 26): accept a price (the
// highest bid, or the lowest they'd take), or change their mind before a buyer accepts. Their consultant is told, and
// offers it to a bidder at that price or more.
export async function POST(req: Request) {
  const { lotId, action, amount } = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  if (!(await allow(`seller-after:${user.id}`, 20, 3600))) return fail("Too many changes. Please call us.", 429);
  const id = Number(lotId);
  if (!Number.isSafeInteger(id) || id <= 0) return fail("Which vehicle?");
  const { error } = action === "withdraw"
    ? await db.rpc("seller_withdraw_after", { p_lot: id })
    : await db.rpc("seller_accept_after", { p_lot: id, p_amount: Number(amount) });
  if (error) return fail(friendly(error.message));
  kickOutbox();
  return json({ ok: true });
}
