import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { dateTime } from "@/lib/format";

export default async function Reports() {
  await requireAdmin(); // checked on every page, not just the layout
  const { data } = await supabaseAdmin().from("reports").select("*, profiles(first_name, last_name, email)").order("created_at", { ascending: false }).limit(200);
  return (
    <>
      <h1 className="d2">Reports.</h1>
      <div className="admin-card" style={{ overflowX: "auto" }}>
        <table className="table"><thead><tr><th>Concern</th><th>From</th><th>Lot</th><th>Status</th><th /></tr></thead>
          <tbody>{(data || []).map((r) => {
            const p = (Array.isArray(r.profiles) ? r.profiles[0] : r.profiles) as { first_name: string; last_name: string; email: string } | null;
            return (
              <tr key={r.id}><td><b>{r.type}</b><br />{r.details}<br /><span className="muted">{dateTime(r.created_at)}</span></td><td>{p?.first_name} {p?.last_name}<br /><span className="muted">{p?.email}</span></td>
                <td>{r.lot_id && <Link className="blue" href={`/admin/lots/${r.lot_id}`}>{r.lot_id}</Link>}</td><td>{r.status}</td>
                <td>{r.status === "open" && <AdminAction action="report" payload={{ reportId: r.id }} label="Mark reviewed" tone="soft" />}</td></tr>
            );
          })}</tbody></table>
      </div>
    </>
  );
}
