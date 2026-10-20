import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { money } from "@/lib/format";
import { RecordDeposit, AdjustDeposit } from "./RecordDeposit";

export const dynamic = "force-dynamic";

type Row = { id: string; user_id: string; kind: string; amount: number; status: string; method: string | null; reference: string | null; payer_name: string | null;
  payer_bsb: string | null; payer_account: string | null; note: string | null; created_at: string; done_at: string | null; invoice_id: string | null;
  profiles: { first_name: string | null; last_name: string | null; deposit_ref: string | null; email: string | null } | null };

const KIND: Record<string, string> = { received: "Received", applied: "Towards a win", returned: "Returned from a cancelled sale", withdrawal: "Refund", adjustment: "Correction" };
const bsb = (s: string | null) => (s ? s.replace(/^(\d{3})(\d{3})$/, "$1-$2") : "");
const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

// Bidding deposits: record money that arrived in the trust account, send refunds back to where they came from,
// and see what we're holding. (With the payments provider on, PayID deposits record themselves.)
export default async function Deposits() {
  await requireAdmin();
  const db = supabaseAdmin();
  const sel = "*, profiles!bidder_deposits_user_id_fkey(first_name, last_name, deposit_ref, email)";
  const [{ data: totals }, { data: pending }, { data: recent }] = await Promise.all([
    db.rpc("deposit_totals"),
    db.from("bidder_deposits").select(sel).eq("kind", "withdrawal").eq("status", "pending").order("created_at"),
    db.from("bidder_deposits").select(sel).order("created_at", { ascending: false }).limit(60),
  ]);
  const t = (totals || {}) as Record<string, number>;
  const who = (r: Row) => `${r.profiles?.first_name || ""} ${r.profiles?.last_name || ""}`.trim() || r.profiles?.email || r.user_id.slice(0, 8);
  return (
    <>
      <h1 className="d2">Deposits.</h1>
      <p className="lede" style={{ margin: 0, fontSize: 18 }}>Bidders pay a refundable deposit by PayID or bank transfer into the trust account. Record it here when it arrives (match the reference on the statement), and send refunds back to the account they came from.</p>
      <div className="kpis" data-testid="deposit-totals">
        <div className="kpi"><span className="l">Held for bidders</span><span className="v">{money(t.held || 0)}</span><small className="muted" style={{ fontSize: 13 }}>{t.bidders || 0} bidders</small></div>
        <div className="kpi"><span className="l">Refunds to send</span><span className="v">{money(t.pending_amount || 0)}</span><small className="muted" style={{ fontSize: 13 }}>{t.pending_count || 0} waiting</small></div>
        <div className="kpi"><span className="l">On unpaid invoices</span><span className="v">{money(t.applied_unpaid || 0)}</span><small className="muted" style={{ fontSize: 13 }}>deposits applied to wins</small></div>
        <div className="kpi"><span className="l">Received this week</span><span className="v">{money(t.received_week || 0)}</span><small className="muted" style={{ fontSize: 13 }}>last 7 days</small></div>
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Record a deposit that arrived</h2>
        <RecordDeposit />
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12, overflowX: "auto" }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Refunds to send ({(pending || []).length})</h2>
        {(pending as Row[] | null)?.length ? (
          <table className="table"><thead><tr><th>Member</th><th>Amount</th><th>Asked</th><th>Send to (where it came from)</th><th /></tr></thead>
            <tbody>{(pending as Row[]).map((r) => (
              <tr key={r.id} data-testid={`refund-${r.id}`}>
                <td><b>{who(r)}</b><br /><span className="muted">{r.profiles?.deposit_ref}</span></td>
                <td><b>{money(-r.amount, true)}</b></td>
                <td><span style={{ whiteSpace: "nowrap" }}>{when(r.created_at)}</span></td>
                <td>{r.payer_name || "?"}{r.payer_bsb ? <><br />BSB {bsb(r.payer_bsb)} · Acct {r.payer_account}</> : <><br /><span className="errmsg">No account on file: it came by PayID. Call them for the account in their name.</span></>}</td>
                <td><span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <AdminAction action="withdrawal-paid" payload={{ id: r.id }} label="Mark sent" input={{ name: "reference", placeholder: "Bank reference (optional)" }} tone="blue" />
                  <AdminAction action="withdrawal-cancel" payload={{ id: r.id }} label="Can't send" confirmText="Put it back in their deposit and tell them?" tone="bad" />
                </span></td>
              </tr>
            ))}</tbody></table>
        ) : <p className="muted" style={{ margin: 0 }}>Nothing to send.</p>}
      </div>

      <details className="admin-card">
        <summary style={{ fontSize: 18, fontWeight: 800, cursor: "pointer" }}>Correct a balance</summary>
        <div style={{ marginTop: 14 }}><AdjustDeposit /></div>
      </details>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12, overflowX: "auto" }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Recent movements</h2>
        <table className="table"><thead><tr><th>When</th><th>Member</th><th>What</th><th>Amount</th><th>From / note</th></tr></thead>
          <tbody>{((recent || []) as Row[]).map((r) => (
            <tr key={r.id} style={r.status === "cancelled" ? { opacity: 0.5 } : undefined}>
              <td><span style={{ whiteSpace: "nowrap" }}>{when(r.created_at)}</span></td>
              <td>{who(r)}<br /><span className="muted">{r.profiles?.deposit_ref}</span></td>
              <td>{KIND[r.kind] || r.kind}{r.status === "pending" ? " (to send)" : r.status === "cancelled" ? " (cancelled)" : ""}{r.method ? ` · ${r.method === "payid" ? "PayID" : r.method === "bpay" ? "BPAY" : "bank"}` : ""}</td>
              <td style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: r.amount > 0 ? "#0B7A47" : undefined }}>{r.amount > 0 ? "+" : "−"}{money(Math.abs(r.amount), true)}</td>
              <td>{[r.payer_name, r.payer_bsb ? `BSB ${bsb(r.payer_bsb)}` : null, r.reference, r.note].filter(Boolean).join(" · ")}</td>
            </tr>
          ))}</tbody></table>
      </div>
    </>
  );
}
