import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dateTime, money } from "@/lib/format";
import { LeadRow } from "./LeadRow";

const KINDS = ["all", "finance", "insurance", "inspection"];
const STATUSES = ["open", "converted", "lost", "all"];
type Lead = { id: string; ref: string; kind: string; status: string; name: string; email: string; phone: string; postcode: string | null; details: Record<string, unknown>; revenue: number | null; price: number | null; admin_note: string | null; report_url: string | null; created_at: string; lot_id: number | null; partners: { name: string } | { name: string }[] | null };

// Enquiries passed to finance, insurance and inspection partners. Record each partner's fee here
// as it's paid, so the revenue report adds up.
export default async function Leads({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string }> }) {
  await requireAdmin(); // checked on every page, not just the layout
  const { kind = "all", status = "open" } = await searchParams;
  let q = supabaseAdmin().from("partner_leads").select("id, ref, kind, status, name, email, phone, postcode, details, revenue, price, admin_note, report_url, created_at, lot_id, partners(name)").order("created_at", { ascending: false }).limit(300);
  if (KINDS.includes(kind) && kind !== "all") q = q.eq("kind", kind);
  if (status === "open") q = q.in("status", ["new", "sent", "contacted", "booked"]);
  else if (status === "converted") q = q.in("status", ["converted", "completed"]);
  else if (status === "lost") q = q.in("status", ["lost", "withdrawn"]);
  const { data } = await q;
  const leads = (data || []) as unknown as Lead[];
  const href = (k: string, s: string) => `/admin/leads?kind=${k}&status=${s}`;
  return (
    <>
      <h1 className="d2">Leads.</h1>
      <p className="muted">Each enquiry is emailed to the partner as it comes in. Update the status as partners report back, and enter the fee when you&apos;re paid. Mobile inspections: send the inspector the vehicle&apos;s address and the seller&apos;s contact details, then add the report link.</p>
      <div className="pill-row">{KINDS.map((k) => <Link key={k} className="pill pill-soft" href={href(k, status)} style={kind === k ? { background: "var(--ink)", color: "#FFFFFF" } : undefined}>{k}</Link>)}</div>
      <div className="pill-row">{STATUSES.map((s) => <Link key={s} className="pill pill-soft" href={href(kind, s)} style={status === s ? { background: "var(--ink)", color: "#FFFFFF" } : undefined}>{s}</Link>)}
        <a className="pill pill-soft" href={`/api/admin-export/leads?kind=${kind}`}>Download CSV</a></div>
      <div className="admin-card" style={{ overflowX: "auto" }}>
        <table className="table"><thead><tr><th>Lead</th><th>Person</th><th>Details</th><th>Status and fee</th></tr></thead>
          <tbody>{leads.map((l) => {
            const p = Array.isArray(l.partners) ? l.partners[0] : l.partners;
            return (
              <tr key={l.id}>
                <td><b>{l.ref}</b><br /><span className="muted">{l.kind} · {p?.name}</span><br /><span className="muted">{dateTime(l.created_at)}</span>{l.lot_id && <><br /><Link className="blue" href={`/admin/lots/${l.lot_id}`}>Lot {l.lot_id}</Link></>}</td>
                <td>{l.name}<br /><a className="blue" href={`tel:${l.phone}`}>{l.phone}</a><br /><a className="blue" href={`mailto:${l.email}`}>{l.email}</a>{l.postcode && <><br />{l.postcode}</>}</td>
                <td style={{ fontSize: 13 }}>{Object.entries(l.details || {}).map(([k, v]) => <div key={k}><span className="muted">{k.replace("_", " ")}:</span> {["amount", "deposit", "balloon"].includes(k) ? money(Number(v)) : String(v)}</div>)}{l.price != null && <div><span className="muted">price from:</span> {money(l.price)}</div>}</td>
                <td><LeadRow id={l.id} status={l.status} revenue={l.revenue} note={l.admin_note} report={l.report_url} inspection={l.kind === "inspection"} /></td>
              </tr>
            );
          })}</tbody></table>
        {leads.length === 0 && <p className="muted" style={{ padding: 16 }}>No leads.</p>}
      </div>
    </>
  );
}
