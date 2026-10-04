import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AuditForm } from "./AuditForm";

// Monthly listing audit: someone who didn't write the listing checks a sample of live ones
// against their photos and papers. A record of these checks is part of our consumer law
// compliance program (the court ordered Grays to run one after misdescribed cars).
export default async function Audits() {
  await requireAdmin(); // checked on every page, not just the layout
  const db = supabaseAdmin();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: live }, { data: recent }] = await Promise.all([
    db.from("lots").select("id, title, published_at").eq("status", "live").order("published_at", { ascending: false }).limit(300),
    db.from("listing_audits").select("id, lot_id, ok, note, created_at, checks, profiles(first_name, last_name), lots(title)").order("created_at", { ascending: false }).limit(60),
  ]);
  const auditedRecently = new Set((recent || []).filter((a) => a.created_at >= since).map((a) => a.lot_id));
  // A different sample every day: not yet audited this month, picked by the day of the year.
  const day = Math.floor(Date.now() / 86400000);
  const pool = (live || []).filter((l) => !auditedRecently.has(l.id));
  const sample = pool.map((l) => ({ l, k: ((l.id * 2654435761) ^ day) >>> 0 })).sort((a, b) => a.k - b.k).slice(0, 10).map((x) => x.l);
  const month = (recent || []).filter((a) => a.created_at >= since);
  return (
    <>
      <h1 className="d2">Listing audits.</h1>
      <p className="muted">Each month, check at least 10 live listings you didn&apos;t write. Compare the listing with its photos, the PPSR certificate and the seller&apos;s answers. Fix anything wrong in the vehicle editor: the change is shown on the listing and bidders are told.</p>
      <div className="stat-row"><span>{month.length} audited in the last 30 days</span><span>{month.filter((a) => !a.ok).length} found a problem</span></div>
      <h2 className="d3" style={{ fontSize: 30 }}>To audit today.</h2>
      {sample.length === 0 && <div className="empty"><b>Every live listing has been audited this month.</b></div>}
      {sample.map((l) => <div className="admin-card" key={l.id}><b><Link className="blue" href={`/lot/${l.id}`} target="_blank">{l.title}</Link></b> <span className="muted">Lot {l.id} · <Link className="blue" href={`/admin/lots/${l.id}`}>Edit</Link></span><AuditForm lotId={l.id} /></div>)}
      <h2 className="d3" style={{ fontSize: 30 }}>Recent audits.</h2>
      <table className="table"><thead><tr><th>When</th><th>Vehicle</th><th>Result</th><th>By</th><th>Note</th></tr></thead>
        <tbody>{(recent || []).map((a) => {
          const p = (Array.isArray(a.profiles) ? a.profiles[0] : a.profiles) as { first_name: string | null; last_name: string | null } | null;
          const lot = (Array.isArray(a.lots) ? a.lots[0] : a.lots) as { title: string } | null;
          return <tr key={a.id}><td>{new Date(a.created_at).toLocaleDateString("en-AU")}</td><td><Link className="blue" href={`/admin/lots/${a.lot_id}`}>{lot?.title || a.lot_id}</Link></td><td>{a.ok ? "All correct" : "Problem found"}</td><td>{p ? `${p.first_name || ""} ${p.last_name || ""}` : ""}</td><td>{a.note}</td></tr>;
        })}</tbody></table>
    </>
  );
}
