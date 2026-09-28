import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { json, fail } from "@/lib/api";

// Checks a pay-now payment with Stripe directly, in case the webhook is slow.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await getSession();
  if (!user) return fail("Sign in first.", 401);
  const db = supabaseAdmin();
  const { data: inv } = await db.from("invoices").select("*").eq("id", id).eq("buyer_id", user.id).single();
  const stripe = getStripe();
  if (!inv || !stripe || !inv.stripe_payment_intent) return json({ status: inv?.status });
  const pi = await stripe.paymentIntents.retrieve(inv.stripe_payment_intent);
  if (pi.status === "succeeded" && inv.status === "payment_failed") {
    await db.from("invoices").update({ status: inv.mode === "card" ? "paid" : "deposit_paid", paid_at: new Date().toISOString(), failure_reason: null }).eq("id", id);
    return json({ status: inv.mode === "card" ? "paid" : "deposit_paid" });
  }
  return json({ status: inv.status });
}
