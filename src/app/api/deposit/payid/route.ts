import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { allow } from "@/lib/ratelimit";
import { createPayId, payIdEnabled } from "@/lib/payid";

// A single-use PayID for a deposit of exactly this amount (when the payments provider is set up).
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  if (!payIdEnabled()) return fail("Pay by bank transfer with your reference for now.", 404);
  if (!(await allow(`payid:${user.id}`, 10, 3600))) return fail("Too many requests. Use the bank details instead.", 429);
  const amount = Math.round(Number(String(b.amount ?? "").replace(/[^0-9.]/g, "")));
  if (!(amount >= 50 && amount <= 200000)) return fail("Choose an amount between $50 and $200,000.");
  const admin = supabaseAdmin();
  const { data: p } = await admin.from("profiles").select("first_name, last_name, deposit_ref, details_done").eq("id", user.id).single();
  if (!p?.details_done) return fail("Add your details first (Account → Your details).");
  const expires = new Date(Date.now() + 3 * 86400_000);
  const { data: row, error } = await admin.from("payment_requests").insert({ user_id: user.id, purpose: "deposit", amount, provider: "azupay", expires_at: expires.toISOString() }).select("id").single();
  if (error || !row) return fail("We couldn't set that up. Use the bank details instead.");
  try {
    const r = await createPayId({ requestId: row.id, amount, description: `Tyrebiter bidding deposit ${p.deposit_ref}`, expiresAt: expires, payerName: `${p.first_name} ${p.last_name}` });
    await admin.from("payment_requests").update({ payid: r.payId, provider_id: r.providerId || null, raw: r.raw as object }).eq("id", row.id);
    return json({ id: row.id, payId: r.payId, amount, expiresAt: expires.toISOString() });
  } catch {
    await admin.from("payment_requests").update({ status: "failed" }).eq("id", row.id);
    return fail("PayID isn't available right now. Use the bank details instead.", 502);
  }
}
