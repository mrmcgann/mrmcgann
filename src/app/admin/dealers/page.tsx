import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { formatAbn } from "@/lib/abn";
import { BatchPaid } from "./BatchPaid";

export const dynamic = "force-dynamic";

type P = { id: string; first_name: string | null; last_name: string | null; email: string | null; mobile: string | null; company_name: string | null; abn: string | null; gst_registered: boolean; dealer_licence: string | null; dealer_status: string; dealer_applied_at: string | null; dealer_note: string | null; deposit_ref: string | null };
const COLS = "id, first_name, last_name, email, mobile, company_name, abn, gst_registered, dealer_licence, dealer_status, dealer_applied_at, dealer_note, deposit_ref";

// Dealer accounts: check the ABN (abr.business.gov.au), approve, and match one transfer to several invoices.
export default async function Dealers() {
  await requireAdmin();
  const db = supabaseAdmin();
  const [{ data: pending }, { data: approved }] = await Promise.all([
    db.from("profiles").select(COLS).eq("dealer_status", "pending").order("dealer_applied_at").limit(200),
    db.from("profiles").select(COLS).eq("dealer_status", "approved").order("company_name").limit(500),
  ]);
  const appr = (approved || []) as P[];
  const { data: owing } = appr.length ? await db.from("invoices").select("id, ref, buyer_id, balance_due, lots(title)").eq("status", "deposit_paid").eq("pay_method", "bank").in("buyer_id", appr.map((p) => p.id)) : { data: [] };
  const byBuyer = new Map<string, { id: string; ref: string; title: string; balance: number }[]>();
  for (const i of (owing || []) as unknown as { id: string; ref: string; buyer_id: string; balance_due: number; lots: { title: string } | null }[]) {
    byBuyer.set(i.buyer_id, [...(byBuyer.get(i.buyer_id) || []), { id: i.id, ref: i.ref, title: i.lots?.title || "", balance: Number(i.balance_due) }]);
  }
  const who = (p: P) => <span><b>{p.company_name}</b> · ABN {formatAbn(p.abn)}{p.gst_registered ? " · GST" : ""}{p.dealer_licence ? ` · ${p.dealer_licence}` : ""}<br /><span className="muted">{p.first_name} {p.last_name} · {p.mobile} · {p.email}</span>{p.dealer_note ? <><br /><span className="muted">{p.dealer_note}</span></> : null}</span>;
  return (
    <>
      <h1 className="d2">Dealers.</h1>
      <p className="lede" style={{ margin: 0, fontSize: 18 }}>Businesses buying several vehicles. Check each ABN on <a className="blue" href="https://abr.business.gov.au" target="_blank" rel="noreferrer">ABN Lookup</a> (active, the name matches, GST as they say) before approving. Approved dealers pay several invoices with one transfer, using their own reference.</p>
      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="dealers-pending">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>To check ({(pending || []).length})</h2>
        {((pending || []) as P[]).map((p) => (
          <div key={p.id} className="vw-row">
            {who(p)}
            <span className="pill-row">
              <AdminAction action="dealer" payload={{ userId: p.id, approve: true }} label="Approve" tone="blue" confirmText="ABN checked and the name matches?" />
              <AdminAction action="dealer" payload={{ userId: p.id, approve: false }} label="Decline" tone="bad" input={{ name: "note", placeholder: "Why (they see this)" }} />
            </span>
          </div>
        ))}
        {!(pending || []).length && <span className="muted">Nothing waiting.</span>}
      </div>
      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="dealers-approved">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Approved ({appr.length})</h2>
        {appr.map((p) => (
          <div key={p.id} className="vw-row">
            {who(p)}
            <span>Payment reference <b>{p.deposit_ref || "none yet"}</b></span>
            {byBuyer.get(p.id)?.length ? <BatchPaid invoices={byBuyer.get(p.id)!} /> : <span className="muted">Nothing owing.</span>}
          </div>
        ))}
      </div>
    </>
  );
}
