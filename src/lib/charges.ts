import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripe, cents } from "@/lib/stripe";
import { notify } from "@/lib/notify";
import { env } from "@/lib/env";
import { money } from "@/lib/format";

// Takes payment for a new invoice straight away, like Grays:
// under $5,000 the full amount; otherwise the non-refundable deposit.
export async function chargeInvoice(invoiceId: string) {
  const db = supabaseAdmin();
  const { data: inv } = await db.from("invoices").select("*, lots(title, suburb, state)").eq("id", invoiceId).single();
  if (!inv || inv.status !== "pending_charge") return;
  const { data: buyer } = await db.from("profiles").select("*").eq("id", inv.buyer_id).single();
  const title = inv.lots?.title || `Lot ${inv.lot_id}`;
  const stripe = getStripe();

  let ok = false;
  let reason = "";
  let intentId: string | null = null;

  if (stripe && buyer?.stripe_customer_id && buyer?.payment_method_id) {
    try {
      const pi = await stripe.paymentIntents.create({
        amount: cents(inv.card_amount),
        currency: "aud",
        customer: buyer.stripe_customer_id,
        payment_method: buyer.payment_method_id,
        off_session: true,
        confirm: true,
        description: `${inv.ref} · ${title}`,
        metadata: { invoice_id: inv.id, lot_id: String(inv.lot_id), kind: inv.mode === "card" ? "full" : "deposit" },
      });
      intentId = pi.id;
      ok = pi.status === "succeeded";
      if (!ok) reason = `Payment needs attention (${pi.status}).`;
    } catch (e: unknown) {
      const err = e as { message?: string; payment_intent?: { id: string } };
      reason = err.message || "Card declined.";
      intentId = err.payment_intent?.id || null;
    }
  } else if (env.testMode) {
    ok = true; // test mode: pretend the card charge went through
  } else {
    reason = "No card on file or payments aren't set up.";
  }

  if (ok) {
    await db.from("invoices").update({
      status: inv.mode === "card" ? "paid" : "deposit_paid",
      paid_at: new Date().toISOString(), stripe_payment_intent: intentId, failure_reason: null,
    }).eq("id", inv.id);
    const body = inv.mode === "card"
      ? `You've bought the ${title}. ${money(inv.card_amount, true)} was charged to your card. We'll send the seller's address and book your collection.`
      : `You've bought the ${title}. A ${money(inv.card_amount, true)} non-refundable deposit was charged to your card. Pay the ${money(inv.balance_due, true)} balance by bank transfer within 2 business days, reference ${inv.ref}.`;
    await notify(inv.buyer_id, "won", `You won the ${title}`, body, `/account/invoices/${inv.id}`);
  } else {
    await db.from("invoices").update({ status: "payment_failed", failure_reason: reason, stripe_payment_intent: intentId }).eq("id", inv.id);
    await notify(inv.buyer_id, "account", `Payment needed for the ${title}`,
      `You won the ${title}, but we couldn't charge your card (${reason}). Pay within 1 business day using the link below, or the sale may be cancelled.`,
      `/account/invoices/${inv.id}`);
  }
}
