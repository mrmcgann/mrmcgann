import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripe, cents } from "@/lib/stripe";
import { json, fail } from "@/lib/api";
import { env } from "@/lib/env";

// Pay-now link for a card charge that was declined when the auction ended.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await getSession();
  if (!user) return fail("Sign in first.", 401);
  const db = supabaseAdmin();
  const { data: inv } = await db.from("invoices").select("*").eq("id", id).eq("buyer_id", user.id).single();
  if (!inv || inv.status !== "payment_failed") return fail("This invoice doesn't need a card payment.");
  const stripe = getStripe();
  if (!stripe) {
    if (!env.testMode) return fail("Card payments aren't set up yet.");
    await db.from("invoices").update({ status: inv.mode === "card" ? "paid" : "deposit_paid", paid_at: new Date().toISOString(), failure_reason: null }).eq("id", id);
    return json({ test: true });
  }
  const pi = await stripe.paymentIntents.create({
    amount: cents(inv.card_amount), currency: "aud",
    customer: (profile as unknown as { stripe_customer_id?: string })?.stripe_customer_id || undefined,
    payment_method_types: ["card"], setup_future_usage: "off_session",
    description: `${inv.ref} retry`, metadata: { invoice_id: inv.id, kind: "retry" },
  });
  await db.from("invoices").update({ stripe_payment_intent: pi.id }).eq("id", id);
  return json({ clientSecret: pi.client_secret });
}
