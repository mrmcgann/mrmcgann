import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripe, cents } from "@/lib/stripe";
import { notify } from "@/lib/notify";
import { env } from "@/lib/env";
import { money, dateLong } from "@/lib/format";
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
// under $5,000 the full amount; otherwise the deposit.
// Each invoice is claimed by exactly one charger (database lock), and Stripe's
// idempotency key means a retry after a crash can never charge twice.
async function chargeClaimed(inv: Invoice & { lots?: { title: string } }) {
  const db = supabaseAdmin();
  if (inv.pay_method === "bank") return finishBankInvoice(inv);
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
      ? `You've bought the ${title}. ${money(inv.card_amount, true)} was charged to your card and your tax invoice is attached. Next, transfer the ownership into your name (the steps are on your invoice) while our transport partner brings it to our depot. Then you book a time to collect it there with your release code.`
      : `You've bought the ${title}. A ${money(inv.card_amount, true)} deposit was charged to your card (you lose it only if you don't pay) and your invoice is attached. Pay the ${money(inv.balance_due, true)} balance by bank transfer or PayID ${inv.due_at ? `by ${dateLong(inv.due_at)}` : "within 2 business days"}, reference ${inv.ref}, to the account on your invoice page. We never change our bank details by email.`;
    await notify(inv.buyer_id, "won", `You won the ${title}`, body, `/account/invoices/${inv.id}`, { dedupe: `won:${inv.id}`, invoiceId: inv.id });
    return "paid";
  }
  await db.from("invoices").update({ status: "payment_failed", failure_reason: reason, stripe_payment_intent: intentId }).eq("id", inv.id).eq("status", "charging");
  await notify(inv.buyer_id, "account", `Payment needed for the ${title}`,
    `You won the ${title}, but we couldn't charge your card (${reason}). Pay within 1 business day using the link below. If you don't, the sale may be cancelled and a cancellation fee may apply (Terms of sale, section 11).`,
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

// Paid by bidding deposit and PayID or bank transfer (no card): the deposit for the price is already on the invoice.
// Nothing is charged; we confirm the win and say exactly how to pay the rest.
async function finishBankInvoice(inv: Invoice & { lots?: { title: string } }) {
  const db = supabaseAdmin();
  const title = inv.lots?.title || `Lot ${inv.lot_id}`;
  const now = new Date().toISOString();
  const full = Number(inv.balance_due) <= 0;
  const { data } = await db.from("invoices").update({ status: full ? "paid" : "deposit_paid", paid_at: now, failure_reason: null, ...(full ? { balance_paid_at: now } : {}) })
    .eq("id", inv.id).eq("status", "charging").select("id");
  if (!data?.length) return "skipped";
  const dep = Number(inv.deposit_applied || 0);
  const body = full
    ? `You've bought the ${title}. It's paid in full from your bidding deposit, and your tax invoice is attached. Next, transfer the ownership into your name (the steps are on your invoice) while our transport partner brings it to our depot. Then you book a time to collect it there with your release code.`
    : `You've bought the ${title}. ${dep > 0 ? `${money(dep, true)} of your bidding deposit has gone towards it. ` : ""}Pay the ${money(inv.balance_due, true)}${dep > 0 ? " balance" : ""} by PayID or bank transfer ${inv.due_at ? `by ${dateLong(inv.due_at)}` : "within 2 business days"}, reference ${inv.ref}, to the account on your invoice page, from an account in your name (or your lender can pay us). We release the vehicle once it has cleared. If it isn't paid, the sale is cancelled and your account closed. We never change our bank details by email or text.`;
  await notify(inv.buyer_id, "won", `You won the ${title}`, body, `/account/invoices/${inv.id}`, { dedupe: `won:${inv.id}`, invoiceId: inv.id });
  return "paid";
}

/** The balance has arrived (our team saw it, or the payments provider told us): paid in full, receipt sent. */
export async function markBalanceReceived(invoiceId: string): Promise<boolean> {
  const db = supabaseAdmin();
  const now = new Date().toISOString();
  const { data: inv } = await db.from("invoices").update({ status: "paid", balance_paid_at: now }).eq("id", invoiceId).eq("status", "deposit_paid").select("buyer_id, lot_id, ref").maybeSingle();
  if (!inv) return false;
  await db.from("invoices").update({ receipt_sent_at: now }).eq("id", invoiceId);
  await notify(inv.buyer_id, "account", `Receipt: ${inv.ref} paid in full`, "Your balance has cleared and your receipt is attached. Next, transfer the ownership into your name (the steps are on your invoice) while our transport partner brings it to our depot. Then you book a time to collect it there with your release code.", `/account/invoices/${invoiceId}`, { dedupe: `receipt:${invoiceId}`, invoiceId });
  return true;
}
