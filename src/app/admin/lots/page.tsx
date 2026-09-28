import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { money, dateTime } from "@/lib/format";

const STATUSES = ["", "draft", "live", "referred", "offers", "sold", "passed", "cancelled"];

export default async function AdminLots({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await requireAdmin(); // checked on every page, not just the layout
  const { status = "", q = "" } = await searchParams;
  let query = supabaseAdmin().from("lots").select("id, title, status, current_bid, bid_count, ends_at, suburb, state, reserve_met, has_reserve, featured").order("created_at", { ascending: false }).limit(200);
  if (status) query = query.eq("status", status);
  if (q) query = query.ilike("title", `%${q}%`);
  const { data } = await query;
  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <h1 className="d2">Vehicles.</h1>
        <Link className="btn btn-blue" href="/admin/lots/new">List a vehicle</Link>
      </div>
      <form className="pill-row" action="/admin/lots">
        <select className="input" name="status" defaultValue={status} style={{ width: 180 }}>{STATUSES.map((s) => <option key={s} value={s}>{s || "All statuses"}</option>)}</select>
        <input className="input" name="q" defaultValue={q} placeholder="Search title" style={{ width: 260 }} />
        <button className="btn btn-dark" style={{ height: 54 }}>Filter</button>
      </form>
      <div className="admin-card" style={{ overflowX: "auto" }}>
        <table className="table"><thead><tr><th>Lot</th><th>Vehicle</th><th>Status</th><th>Bid</th><th>Reserve</th><th>Ends</th><th /></tr></thead>
          <tbody>{(data || []).map((l) => (
            <tr key={l.id}>
              <td>{l.id}</td>
              <td><b>{l.title}</b>{l.featured && <span className="tag" style={{ background: "var(--sun)", height: 22, marginLeft: 6 }}>Featured</span>}<br /><span className="muted">{l.suburb} {l.state}</span></td>
              <td>{l.status}</td>
              <td>{money(l.current_bid)} · {l.bid_count}</td>
              <td>{l.has_reserve ? (l.reserve_met ? "Met" : "Not met") : "None"}</td>
              <td>{dateTime(l.ends_at)}</td>
              <td><Link className="blue" href={`/admin/lots/${l.id}`} style={{ fontWeight: 700 }}>Edit</Link> · <Link className="blue" href={`/lot/${l.id}`}>View</Link></td>
            </tr>
          ))}</tbody></table>
      </div>
    </>
  );
}
