import { revalidateTag } from "next/cache";
import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { json, fail, friendly } from "@/lib/api";
import { chargeInvoice } from "@/lib/charges";
import { kickOutbox } from "@/lib/notify";

// The seller accepts or declines a referred bid or an offer from their dashboard.
export async function POST(req: Request) {
  const { lotId, action, offerId } = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  if (!["accept_referral", "decline_referral", "accept_offer", "decline_offer"].includes(action)) return fail("Unknown action.");
  const { data: invoiceId, error } = await db.rpc("seller_decide", { p_lot: Number(lotId), p_action: action, p_offer: offerId || null });
  if (error) return fail(friendly(error.message));
  if (invoiceId) await chargeInvoice(invoiceId as string);
  kickOutbox();
  revalidateTag(`lot-${Number(lotId)}`);
  return json({ ok: true, invoiceId });
}
