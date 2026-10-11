import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail, friendly } from "@/lib/api";
import { env } from "@/lib/env";
import { kickOutbox } from "@/lib/notify";

// Test mode only: pretend a bidding deposit arrived (there's no bank in test mode).
export async function POST(req: Request) {
  if (!env.testMode) return fail("Not available.", 404);
  const b = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const amount = Math.round(Number(b.amount) || 0);
  if (!(amount > 0 && amount <= 100000)) return fail("Choose an amount.");
  const admin = supabaseAdmin();
  const { data: p } = await admin.from("profiles").select("first_name, last_name, deposit_ref").eq("id", user.id).single();
  const { error } = await admin.rpc("record_deposit", { p_user: user.id, p_amount: amount, p_method: "payid", p_reference: p?.deposit_ref || "test",
    p_payer_name: `${p?.first_name || "Test"} ${p?.last_name || "Bidder"}`, p_payer_bsb: "000000", p_payer_account: "12345678", p_note: "Test mode", p_provider: null, p_provider_ref: null });
  if (error) return fail(friendly(error.message));
  kickOutbox();
  return json({ ok: true });
}
