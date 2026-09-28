import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { money, dateTime, dateLong } from "@/lib/format";

const ST = ["", "pending_charge", "paid", "deposit_paid", "payment_failed", "cancelled"];

export default async function Invoices({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "" } = await searchParams;
  let q = supabaseAdmin().from("invoices").select("*, lots(title), profiles(first_name, last_name, mobile, email)").order("created_at", { ascending: false }).limit(200);
  if (status) q = q.eq("status", status);
  const { data } = await q;
  return (
    <>
      <h1 className="d2">Invoices.</h1>
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
                <td>{inv.status.replace("_", " ")}{overdue && <span className="tag" style={{ background: "var(--berry)", height: 22, marginLeft: 6 }}>Overdue</span>}{inv.failure_reason && <><br /><span className="muted">{inv.failure_reason}</span></>}{inv.collector_name && <><br />Collector: {inv.collector_name}</>}{inv.collected_at && <><br />Collected {dateTime(inv.collected_at)}</>}{inv.seller_paid_at && <><br />Seller paid {dateTime(inv.seller_paid_at)}{inv.seller_payout_note ? ` · ${inv.seller_payout_note}` : ""}</>}</td>
                <td><span className="pill-row">
                  {inv.status === "payment_failed" && <AdminAction action="retry-charge" payload={{ invoiceId: inv.id }} label="Retry card" tone="blue" />}
                  {inv.status === "deposit_paid" && <AdminAction action="balance-received" payload={{ invoiceId: inv.id }} label="Balance received" confirmText="Confirm the transfer has cleared?" tone="blue" />}
                  {inv.status === "paid" && !inv.collected_at && <AdminAction action="collected" payload={{ invoiceId: inv.id }} label="Mark collected" tone="soft" />}
                  {inv.status === "paid" && !inv.seller_paid_at && <AdminAction action="seller-paid" payload={{ invoiceId: inv.id }} label="Seller paid" input={{ name: "note", placeholder: "Amount / transfer ref" }} tone="soft" />}
                  {["payment_failed", "deposit_paid", "pending_charge"].includes(inv.status) && <AdminAction action="cancel-invoice" payload={{ invoiceId: inv.id }} label="Cancel sale" confirmText="Cancel and apply the cancellation fee?" tone="bad" />}
                </span></td>
              </tr>
            );
          })}</tbody></table>
      </div>
    </>
  );
}
