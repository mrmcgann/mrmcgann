import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dateTime } from "@/lib/format";
import { SaleForm, StaggerForm } from "./SaleForms";

// Fleet and business sales: one seller's vehicles grouped on one page, closing a few minutes apart.
export default async function SaleEvents() {
  await requireAdmin(); // checked on every page, not just the layout
  const db = supabaseAdmin();
  const { data: sales } = await db.from("sales").select("*").order("created_at", { ascending: false }).limit(100);
  const ids = (sales || []).map((x) => x.id);
  const { data: lots } = await db.from("lots").select("id, sale_id, status, ends_at, bid_count").in("sale_id", ids.length ? ids : [0]);
  return (
    <>
      <h1 className="d2">Fleet sales.</h1>
      <p className="muted">Group a fleet&apos;s or a business&apos;s vehicles on one sale page. Add vehicles to a sale from the vehicle editor or the bulk upload. Then stagger the closing times so one closes every few minutes.</p>
      <div className="admin-card"><h2 style={{ fontSize: 22, fontWeight: 800 }}>New sale</h2><SaleForm /></div>
      {(sales || []).map((x) => {
        const mine = (lots || []).filter((l) => l.sale_id === x.id);
        const live = mine.filter((l) => l.status === "live");
        const ends = live.map((l) => l.ends_at).filter(Boolean).sort();
        return (
          <div key={x.id} className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="sale-card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div><b style={{ fontSize: 20 }}>{x.title}</b> <span className="tag" style={{ background: x.published ? "var(--mint)" : "var(--panel)" }}>{x.published ? "Published" : "Hidden"}</span><br />
                <span className="muted">/sales/{x.slug} · {mine.length} vehicles ({live.length} live){ends.length ? ` · closing ${dateTime(ends[0])} to ${dateTime(ends[ends.length - 1])}` : ""}</span></div>
              <span className="pill-row">
                {x.published && <Link className="btn btn-soft" style={{ height: 38, fontSize: 13 }} href={`/sales/${x.slug}`} target="_blank">View</Link>}
                <Link className="btn btn-soft" style={{ height: 38, fontSize: 13 }} href={`/admin/lots?sale=${x.id}`}>Vehicles</Link>
                <a className="btn btn-soft" style={{ height: 38, fontSize: 13 }} href={`/api/admin/sale-report/${x.id}`}>Report (CSV)</a>
              </span>
            </div>
            <details><summary style={{ cursor: "pointer", fontWeight: 700 }}>Edit</summary><SaleForm sale={x} /></details>
            <StaggerForm saleId={x.id} />
          </div>
        );
      })}
    </>
  );
}
