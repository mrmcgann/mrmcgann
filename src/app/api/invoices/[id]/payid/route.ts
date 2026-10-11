import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { allow } from "@/lib/ratelimit";
import { createPayId, payIdEnabled } from "@/lib/payid";

// A single-use PayID for exactly the balance of this invoice (when the payments provider is set up).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  if (!payIdEnabled()) return fail("Pay by bank transfer with your invoice number for now.", 404);
  if (!(await allow(`payid:${user.id}`, 10, 3600))) return fail("Too many requests. Use the bank details instead.", 429);
  const { data: inv } = await db.from("invoices").select("id, ref, buyer_id, status, balance_due, due_at").eq("id", id).maybeSingle();
  if (!inv || inv.buyer_id !== user.id) return fail("Not found.", 404);
  if (inv.status !== "deposit_paid" || !(Number(inv.balance_due) > 0)) return fail("There's nothing to pay on this invoice right now.");
  const admin = supabaseAdmin();
  const { data: open } = await admin.from("payment_requests").select("id, payid, amount, expires_at").eq("invoice_id", id).eq("status", "waiting")
    .gt("expires_at", new Date().toISOString()).not("payid", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (open && Number(open.amount) === Number(inv.balance_due)) return json({ id: open.id, payId: open.payid, amount: Number(open.amount), expiresAt: open.expires_at });
  const expires = new Date(Date.now() + 5 * 86400_000);
  const { data: row, error } = await admin.from("payment_requests").insert({ user_id: user.id, purpose: "invoice", invoice_id: id, amount: inv.balance_due, provider: "azupay", expires_at: expires.toISOString() }).select("id").single();
  if (error || !row) return fail("We couldn't set that up. Use the bank details instead.");
  try {
    const r = await createPayId({ requestId: row.id, amount: Number(inv.balance_due), description: `Tyrebiter invoice ${inv.ref}`, expiresAt: expires });
    await admin.from("payment_requests").update({ payid: r.payId, provider_id: r.providerId || null, raw: r.raw as object }).eq("id", row.id);
    return json({ id: row.id, payId: r.payId, amount: Number(inv.balance_due), expiresAt: expires.toISOString() });
  } catch {
    await admin.from("payment_requests").update({ status: "failed" }).eq("id", row.id);
    return fail("PayID isn't available right now. Use the bank details instead.", 502);
  }
}
