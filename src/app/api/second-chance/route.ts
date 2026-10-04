import { revalidateTag } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import { currentUser } from "@/lib/auth";
import { chargeInvoice } from "@/lib/charges";
import { kickOutbox } from "@/lib/notify";
import { allow } from "@/lib/ratelimit";
import { json, fail, friendly } from "@/lib/api";

// The next highest bidder answers an offer to buy a vehicle whose winner didn't pay.
// Accepting makes the sale at their highest bid and takes payment as for a win.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  if (!(await allow(`second-chance:${user.id}`, 20, 3600))) return fail("Too many attempts. Call us.", 429);
  const { data: inv, error } = await db.rpc("respond_second_chance", { p_offer: String(b.id || ""), p_accept: b.accept === true });
  if (error) return fail(friendly(error.message));
  if (inv) {
    await chargeInvoice(inv as string);
    const { data: lot } = await db.from("invoices").select("lot_id").eq("id", inv).maybeSingle();
    if (lot?.lot_id) revalidateTag(`lot-${lot.lot_id}`);
  }
  kickOutbox();
  return json({ ok: true, invoiceId: inv || null });
}
