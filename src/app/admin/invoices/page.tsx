import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { money, dateTime, dateLong } from "@/lib/format";

const ST = ["", "pending_charge", "charging", "paid", "deposit_paid", "payment_failed", "cancelled"];

export default async function Invoices({ searchParams }: { searchParams: Promise<{ status?: string; ref?: string }> }) {
  await requireAdmin(); // checked on every page, not just the layout
  const { status = "", ref = "" } = await searchParams;
  const db = supabaseAdmin();
  let q = db.from("invoices").select("*, lots(title), profiles(first_name, last_name, mobile, email)").order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  // the reference on a bank statement: an invoice number (TB-…), a member's reference (BID…) or a BPAY CRN
  const find = ref.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24);
  if (find) {
    if (/^TB-?\d+$/.test(find)) q = q.eq("ref", find.includes("-") ? find : find.replace(/^TB/, "TB-"));
    else {
      const { data: m } = await db.from("profiles").select("id").or(`deposit_ref.eq.${find.replace(/-/g, "")},bpay_crn.eq.${find.replace(/\D/g, "") || "0"}`).limit(1).maybeSingle();
      q = q.eq("buyer_id", m?.id || "00000000-0000-0000-0000-000000000000");
    }
  }
  const { data } = await q;
  return (
    <>
      <h1 className="d2">Invoices.</h1>
      <form className="pill-row" action="/admin/invoices" role="search">
        <input className="input" name="ref" defaultValue={ref} placeholder="Reference on the payment: TB-…, BID… or BPAY CRN" aria-label="Find by payment reference" style={{ maxWidth: 380 }} />
        <button className="btn btn-dark" style={{ height: 44, fontSize: 14 }}>Find</button>
        {ref && <Link className="linkbtn" href="/admin/invoices">Clear</Link>}
      </form>
      <div className="pill-row">{ST.map((s) => <Link key={s} className="pill pill-soft" href={`/admin/invoices${s ? `?status=${s}` : ""}`} style={status === s ? { background: "var(--ink)", color: "#FFFFFF" } : undefined}>{s ? s.replace("_", " ") : "All"}</Link>)}</div>
      <div className="admin-card" style={{ overflowX: "auto" }}>
        <table className="table"><thead><tr><th>Invoice</th><th>Buyer</th><th>Amounts</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{(data || []).map((inv) => {
            const b = (Array.isArray(inv.profiles) ? inv.profiles[0] : inv.profiles) as { first_name: string; last_name: string; mobile: string; email: string } | null;
            const lot = (Array.isArray(inv.lots) ? inv.lots[0] : inv.lots) as { title: string } | null;
            const overdue = inv.status === "deposit_paid" && inv.due_at && new Date(inv.due_at) < new Date();
            return (
              <tr key={inv.id}>
                <td><b>{inv.ref}</b><br />{lot?.title}<br /><span className="muted">{inv.sold_via} · {dateTime(inv.created_at)}</span></td>
                <td>{b?.first_name} {b?.last_name}<br /><span className="muted">{b?.mobile}<br />{b?.email}</span></td>
                <td>Total {money(inv.total, true)}<br /><span className="muted">Card {money(inv.card_amount, true)}{inv.balance_due > 0 ? ` · balance ${money(inv.balance_due, true)} due ${dateLong(inv.due_at)}` : ""}</span></td>
                <td>{inv.status.replace("_", " ")}{overdue && <span className="tag" style={{ background: "var(--berry)", height: 22, marginLeft: 6 }}>Overdue</span>}{inv.failure_reason && <><br /><span className="muted">{inv.failure_reason}</span></>}{inv.cancel_reason && <><br /><span className="muted">{inv.cancel_reason === "buyer_default" ? "Buyer didn't pay" : inv.cancel_reason.replace("not_buyer_fault: ", "Refunded: ")}</span></>}{inv.refund_note && <><br /><span className="errmsg" style={{ fontSize: 13 }}>To do: {inv.refund_note}</span></>}{inv.collector_name && <><br />Collector: {inv.collector_name}</>}{inv.collected_at && <><br />Collected {dateTime(inv.collected_at)}</>}{inv.seller_paid_at && <><br />Seller paid {dateTime(inv.seller_paid_at)}{inv.seller_payout_note ? ` · ${inv.seller_payout_note}` : ""}</>}</td>
                <td><span className="pill-row">
                  {inv.status === "payment_failed" && <AdminAction action="retry-charge" payload={{ invoiceId: inv.id }} label="Retry card" tone="blue" />}
                  {inv.status === "deposit_paid" && <AdminAction action="balance-received" payload={{ invoiceId: inv.id }} label="Balance received" confirmText="Confirm the transfer has cleared?" tone="blue" />}
                  {inv.status === "paid" && !inv.collected_at && <AdminAction action="collected" payload={{ invoiceId: inv.id }} label="Mark collected" confirmText="Only if the seller confirmed handover by phone. Starts the claim window." tone="soft" />}
                  <a className="btn btn-soft" style={{ height: 38, fontSize: 13, padding: "0 14px" }} href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer">PDF</a>
                  {["payment_failed", "deposit_paid"].includes(inv.status) && <AdminAction action="cancel-invoice" payload={{ invoiceId: inv.id }} label="Cancel: buyer didn't pay" confirmText="Cancel for non-payment? The buyer is banned (they can't bid again, even with a new account), and any deposit applied to it is kept." tone="bad" />}
                  {["paid", "deposit_paid", "payment_failed", "pending_charge"].includes(inv.status) && <AdminAction action="refund-cancel" payload={{ invoiceId: inv.id }} label="Cancel and refund" input={{ name: "reason", placeholder: "Why (buyer and seller see it)" }} confirmText="Not the buyer's fault: refund everything they paid." tone="bad" />}
                </span></td>
              </tr>
            );
          })}</tbody></table>
      </div>
    </>
  );
}
