import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripe, cents } from "@/lib/stripe";
import { notify } from "@/lib/notify";
import { env } from "@/lib/env";
import { money } from "@/lib/format";
import type { Invoice } from "@/lib/types";

// Has Stripe already taken a payment for this invoice? (Used before any retry, so a
// payment that went through but never reported back can't be taken twice.)
export async function findSucceededPayment(invoiceId: string): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    const r = await stripe.paymentIntents.search({ query: `metadata['invoice_id']:'${invoiceId}' AND status:'succeeded'`, limit: 5 });
    const hit = r.data.find((p) => p.metadata?.kind !== "cancel_fee");
    return hit?.id || null;
  } catch { return null; }
}

// Records a successful card payment against an invoice (idempotent).
export async function markInvoicePaid(invoiceId: string, intentId: string | null) {
  const db = supabaseAdmin();
  const { data: inv } = await db.from("invoices").select("mode, status").eq("id", invoiceId).maybeSingle();
  if (!inv || !["pending_charge", "charging", "payment_failed"].includes(inv.status)) return false;
  const { data } = await db.from("invoices").update({ status: inv.mode === "card" ? "paid" : "deposit_paid", paid_at: new Date().toISOString(),
    stripe_payment_intent: intentId, failure_reason: null }).eq("id", invoiceId).in("status", ["pending_charge", "charging", "payment_failed"]).select("id");
  return !!data?.length;
}

// Takes payment for a new invoice straight away, like Grays:
// under $5,000 the full amount; otherwise the non-refundable deposit.
// Each invoice is claimed by exactly one charger (database lock), and Stripe's
// idempotency key means a retry after a crash can never charge twice.
async function chargeClaimed(inv: Invoice & { lots?: { title: string } }) {
  const db = supabaseAdmin();
  const { data: buyer } = await db.from("profiles").select("stripe_customer_id, payment_method_id").eq("id", inv.buyer_id).single();
  const title = inv.lots?.title || `Lot ${inv.lot_id}`;
  const stripe = getStripe();
  let ok = false, reason = "", intentId: string | null = null;

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
      }, { idempotencyKey: `invoice-${inv.id}-${inv.charge_attempts || 1}` });
      intentId = pi.id;
      ok = pi.status === "succeeded";
      if (!ok) reason = `Payment needs attention (${pi.status}).`;
    } catch (e: unknown) {
      const err = e as { message?: string; payment_intent?: { id: string; status?: string }; statusCode?: number; type?: string };
      if ((err.statusCode === 429 || err.type === "StripeConnectionError") && (inv.charge_attempts || 1) < 20) {
        // Stripe busy or unreachable (nothing was recorded): try again next minute with the same key.
        await db.from("invoices").update({ status: "pending_charge", charge_attempts: Math.max(0, (inv.charge_attempts || 1) - 1) }).eq("id", inv.id).eq("status", "charging");
        return "retry";
      }
      if (err.type === "StripeAPIError") {
        // A Stripe-side error: the result is unknown, so check before doing anything else.
        const done = await findSucceededPayment(inv.id);
        if (done) { ok = true; intentId = done; }
        else reason = "Our payment provider had a problem. We'll sort it out and contact you if we need anything.";
      } else {
        reason = err.message || "Card declined.";
        intentId = err.payment_intent?.id || null;
      }
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
    }).eq("id", inv.id).eq("status", "charging");
    const body = inv.mode === "card"
      ? `You've bought the ${title}. ${money(inv.card_amount, true)} was charged to your card and your tax invoice is attached. Next: book your collection time from your invoice. The seller will only hand over the vehicle to someone with your release code.`
      : `You've bought the ${title}. A ${money(inv.card_amount, true)} non-refundable deposit was charged to your card and your invoice is attached. Pay the ${money(inv.balance_due, true)} balance by bank transfer within 2 business days, reference ${inv.ref}. We never change our bank details by email.`;
    await notify(inv.buyer_id, "won", `You won the ${title}`, body, `/account/invoices/${inv.id}`, { dedupe: `won:${inv.id}`, invoiceId: inv.id });
    return "paid";
  }
  await db.from("invoices").update({ status: "payment_failed", failure_reason: reason, stripe_payment_intent: intentId }).eq("id", inv.id).eq("status", "charging");
  await notify(inv.buyer_id, "account", `Payment needed for the ${title}`,
    `You won the ${title}, but we couldn't charge your card (${reason}). Pay within 1 business day using the link below, or the sale may be cancelled.`,
    `/account/invoices/${inv.id}`, { dedupe: `payfail:${inv.id}:${inv.charge_attempts || 1}` });
  return "failed";
}

// Charge one invoice now (Buy Now, accepted referral or offer). Skips it if someone else already has.
export async function chargeInvoice(invoiceId: string) {
  const { data } = await supabaseAdmin().rpc("claim_invoice_charges", { p_limit: 1, p_id: invoiceId }).select("*, lots(title)");
  const inv = (data as unknown as (Invoice & { lots?: { title: string } })[] | null)?.[0];
  if (inv) await chargeClaimed(inv);
}

// Charge everything waiting, a few at a time (Stripe allows ~25 new payments a second).
export async function processCharges(deadlineMs = 40_000) {
  const db = supabaseAdmin();
  const until = Date.now() + deadlineMs;
  let n = 0;
  while (Date.now() < until) {
    const { data } = await db.rpc("claim_invoice_charges", { p_limit: 10, p_id: null }).select("*, lots(title)");
    const batch = (data || []) as unknown as (Invoice & { lots?: { title: string } })[];
    if (!batch.length) break;
    await Promise.all(batch.map((inv) => chargeClaimed(inv).catch(() => "error")));
    n += batch.length;
  }
  return n;
}
