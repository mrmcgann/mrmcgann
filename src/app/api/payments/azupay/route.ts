import { supabaseAdmin } from "@/lib/supabase/admin";
import { readWebhook, webhookOk } from "@/lib/payid";
import { markBalanceReceived } from "@/lib/charges";
import { kickOutbox } from "@/lib/notify";
import { mark } from "@/lib/health";
import { payerMatches } from "@/lib/deposits";

// The payments provider tells us a single-use PayID has been paid. Each request has its own secret in the
// Authorization header (only we and the provider know it), and the amount must match what we asked for.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const w = readWebhook(body);
  if (!/^[0-9a-f-]{36}$/.test(w.requestId) || !webhookOk(w.requestId, req.headers.get("authorization"))) {
    await mark("payid_webhook_bad");
    return new Response("Unauthorised", { status: 401 });
  }
  const db = supabaseAdmin();
  const { data: pr } = await db.from("payment_requests").select("*").eq("id", w.requestId).maybeSingle();
  if (!pr) return new Response("Unknown request", { status: 404 });
  await mark("payid_webhook", { status: w.status });
  if (w.status !== "COMPLETE") {
    if (["EXPIRED", "RETURN_COMPLETE"].includes(w.status) && pr.status === "waiting") await db.from("payment_requests").update({ status: w.status === "EXPIRED" ? "expired" : "cancelled", raw: body }).eq("id", pr.id);
    return new Response("ok");
  }
  if (pr.status === "complete") return new Response("ok"); // already counted
  const paid = w.amount > 0 ? w.amount : Number(pr.amount);
  await db.from("payment_requests").update({ status: "complete", paid_at: new Date().toISOString(), payer_name: w.payerName || null, provider_id: w.providerId || pr.provider_id, raw: body }).eq("id", pr.id).eq("status", "waiting");
  if (pr.purpose === "deposit") {
    // Payments must come from the member's own account. The money is in, so it's recorded, but a name that doesn't
    // match is flagged in Admin → Deposits for our team to check (and send back if it isn't theirs).
    const { data: m } = await db.from("profiles").select("first_name, last_name").eq("id", pr.user_id).maybeSingle();
    const check = w.payerName && !payerMatches(w.payerName, m?.first_name, m?.last_name) ? `Check: paid by ${w.payerName}, not the member's name` : null;
    await db.rpc("record_deposit", { p_user: pr.user_id, p_amount: paid, p_method: "payid", p_reference: `PayID ${pr.payid || ""}`.trim(), p_payer_name: w.payerName || "PayID payer",
      p_payer_bsb: null, p_payer_account: null, p_note: check, p_provider: "azupay", p_provider_ref: w.providerId || pr.id });
  } else if (pr.purpose === "invoice" && pr.invoice_id) {
    const { data: inv } = await db.from("invoices").select("balance_due, status").eq("id", pr.invoice_id).maybeSingle();
    if (inv?.status === "deposit_paid" && paid + 0.005 >= Number(inv.balance_due)) await markBalanceReceived(pr.invoice_id);
  }
  kickOutbox();
  return new Response("ok");
}
