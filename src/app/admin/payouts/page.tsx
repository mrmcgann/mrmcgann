import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { dateTime, money } from "@/lib/format";

export default async function Payouts({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "ready" } = await searchParams;
  const db = supabaseAdmin();
  let q = db.from("seller_payouts").select("*, lots(id, title), invoices(ref, collected_at, claim_until)").order("created_at", { ascending: false }).limit(200);
  if (status !== "all") q = q.eq("status", status);
  const { data } = await q;
  const sellers = [...new Set((data || []).map((p) => p.seller_id).filter(Boolean))];
  const [{ data: banks }, { data: people }] = await Promise.all([
    db.from("seller_bank").select("*").in("seller_id", sellers.length ? sellers : ["00000000-0000-0000-0000-000000000000"]),
    db.from("profiles").select("id, first_name, last_name, mobile").in("id", sellers.length ? sellers : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const bank = new Map((banks || []).map((x) => [x.seller_id, x]));
  const person = new Map((people || []).map((x) => [x.id, x]));
  return (
    <>
      <h1 className="d2">Seller payouts.</h1>
      <p className="muted">A payout becomes <b>ready</b> once the buyer has collected and their claim window has closed with no open claim. Pay any finance to the lender first. Before the first payout to a seller, phone them to confirm their bank details (payment-redirection scams target exactly this).</p>
      <div className="pill-row">{["ready", "pending", "on_hold", "paid", "all"].map((s) => <Link key={s} className="pill pill-soft" href={`/admin/payouts?status=${s}`} style={status === s ? { background: "var(--ink)", color: "#FFFFFF" } : undefined}>{s.replace("_", " ")}</Link>)}</div>
      <div className="admin-card" style={{ overflowX: "auto" }}>
        <table className="table"><thead><tr><th>Vehicle</th><th>Seller and bank</th><th>Amounts</th><th>Status</th><th /></tr></thead>
          <tbody>{(data || []).map((p) => {
            const lot = (Array.isArray(p.lots) ? p.lots[0] : p.lots) as { id: number; title: string } | null;
            const inv = (Array.isArray(p.invoices) ? p.invoices[0] : p.invoices) as { ref: string; collected_at: string | null; claim_until: string | null } | null;
            const bk = bank.get(p.seller_id), who = person.get(p.seller_id);
            return (
              <tr key={p.id}>
                <td><Link href={`/admin/lots/${lot?.id}`} style={{ fontWeight: 700 }}>{lot?.title}</Link><br /><span className="muted">{inv?.ref} · {inv?.collected_at ? `collected ${dateTime(inv.collected_at)}` : "not collected"}</span></td>
                <td>{who ? `${who.first_name} ${who.last_name} · ${who.mobile}` : "Seller not linked"}<br />{bk ? <span className="muted">{bk.account_name} · BSB {bk.bsb} · Acct {bk.account_number}{bk.confirmed_at ? " ✓ confirmed" : ""}</span> : <span className="errmsg">No bank details</span>}
                  {bk && !bk.confirmed_at && <><br /><AdminAction action="bank-confirmed" payload={{ sellerId: p.seller_id }} label="Confirmed by phone" confirmText="You phoned the seller and they read back these details?" tone="soft" /></>}</td>
                <td>Sale {money(p.sale_price, true)}<br /><span className="muted">Fee −{money(Number(p.seller_fee) + Number(p.fee_gst), true)}{Number(p.lender_payout) > 0 ? ` · Lender −${money(p.lender_payout, true)} (${p.lender_name || "?"}${p.lender_ref ? ` ${p.lender_ref}` : ""})` : ""}{Number(p.other_deductions) > 0 ? ` · Other −${money(p.other_deductions, true)} (${p.deductions_note})` : ""}</span><br /><b>Net {money(p.net_amount, true)}</b></td>
                <td>{p.status.replace("_", " ")}{p.hold_reason && <><br /><span className="muted">{p.hold_reason}</span></>}{p.paid_at && <><br />Paid {dateTime(p.paid_at)} · {p.payment_ref}</>}</td>
                <td><span className="pill-row">
                  {p.status === "ready" && <AdminAction action="payout-paid" payload={{ payoutId: p.id }} label="Mark paid" input={{ name: "ref", placeholder: "Bank transfer reference" }} tone="blue" />}
                  {p.status !== "paid" && <AdminAction action="payout-adjust" payload={{ payoutId: p.id }} label="Other deductions" input={{ name: "otherDeductions", placeholder: "$ amount (agreed in writing)" }} tone="soft" />}
                  {["pending", "ready"].includes(p.status) && <AdminAction action="payout-hold" payload={{ payoutId: p.id }} label="Hold" input={{ name: "reason", placeholder: "Reason" }} tone="bad" />}
                  {p.status === "on_hold" && <AdminAction action="payout-hold" payload={{ payoutId: p.id, release: true }} label="Release hold" confirmText="Release this hold?" tone="soft" />}
                  <a className="btn btn-soft" style={{ height: 38, fontSize: 13, padding: "0 14px" }} href={`/api/payouts/${p.id}/pdf`} target="_blank" rel="noreferrer">Statement</a>
                </span></td>
              </tr>
            );
          })}</tbody></table>
      </div>
    </>
  );
}
