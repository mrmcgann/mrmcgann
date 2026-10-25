import { revalidateTag } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { chargeInvoice } from "@/lib/charges";
import { kickOutbox } from "@/lib/notify";
import { allow } from "@/lib/ratelimit";
import { json, fail, failBid, friendly } from "@/lib/api";

// The buyer answers an offer to buy a vehicle after the auction (migration 26): accept it by signing (typing their
// name as it is on their verified account), decline it, or cancel in their cooling-off period. Where the state has no
// cooling-off period, accepting makes the sale and the invoice straight away; otherwise the clock makes them when it ends.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  if (!(await allow(`after-offer:${user.id}`, 30, 3600))) return fail("Too many attempts. Please call us.", 429);
  const id = String(b.id || "");
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail("Which offer?");
  const { data: o } = await db.from("second_chance_offers").select("lot_id").eq("id", id).maybeSingle(); // RLS: their own offers
  if (!o) return fail("We couldn't find that offer.", 404);
  if (b.action === "cancel") {
    const { error } = await db.rpc("cancel_after_offer", { p_offer: id });
    if (error) return fail(friendly(error.message));
    kickOutbox();
    return json({ ok: true, status: "cancelled" });
  }
  const accept = b.action === "accept";
  const { data, error } = await db.rpc("respond_after_offer", { p_offer: id, p_accept: accept, p_name: accept ? String(b.name || "").slice(0, 120) : "" });
  if (error) return failBid(error.message);
  const r = (data || {}) as { status?: string; invoice_id?: string | null; cooling_off_until?: string | null };
  if (r.invoice_id) {
    await chargeInvoice(r.invoice_id);
    revalidateTag(`lot-${o.lot_id}`);
  }
  kickOutbox();
  return json({ ok: true, ...r });
}
