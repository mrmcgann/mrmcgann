import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripe, cents } from "@/lib/stripe";
import { findSucceededPayment, markInvoicePaid } from "@/lib/charges";
import { json, fail } from "@/lib/api";
import { env } from "@/lib/env";

// Pay-now for a card charge that was declined when the auction ended.
// Reuses the same Stripe payment if one is already open, and never takes a second payment.
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
    await markInvoicePaid(inv.id, null);
    return json({ test: true });
  }
  // Already paid (for example a 3-D Secure payment the page didn't hear back about)?
  const done = await findSucceededPayment(inv.id);
  if (done) { await markInvoicePaid(inv.id, done); return json({ paid: true }); }
  if (inv.stripe_payment_intent) {
    const existing = await stripe.paymentIntents.retrieve(inv.stripe_payment_intent).catch(() => null);
    if (existing && ["requires_payment_method", "requires_action", "requires_confirmation"].includes(existing.status) && existing.amount === cents(inv.card_amount)) {
      return json({ clientSecret: existing.client_secret });
    }
    if (existing && existing.status === "processing") return fail("Your last payment is still processing. Check back in a few minutes.");
  }
  const pi = await stripe.paymentIntents.create({
    amount: cents(inv.card_amount), currency: "aud",
    customer: (profile as unknown as { stripe_customer_id?: string })?.stripe_customer_id || undefined,
    payment_method_types: ["card"], setup_future_usage: "off_session",
    description: `${inv.ref} payment`, metadata: { invoice_id: inv.id, lot_id: String(inv.lot_id), kind: "retry" },
  }, { idempotencyKey: `paynow-${inv.id}-${inv.charge_attempts || 0}-${inv.stripe_payment_intent || "first"}` });
  await db.from("invoices").update({ stripe_payment_intent: pi.id }).eq("id", id);
  return json({ clientSecret: pi.client_secret });
}
