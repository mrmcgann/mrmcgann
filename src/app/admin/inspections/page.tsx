import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { dateTime } from "@/lib/format";

export default async function Inspections() {
  await requireAdmin(); // checked on every page, not just the layout
  const { data } = await supabaseAdmin().from("inspections").select("*, lots(id, title, suburb, state), profiles(first_name, last_name, mobile)").neq("status", "cancelled").order("created_at", { ascending: false }).limit(200);
  return (
    <>
      <h1 className="d2">Inspections.</h1>
      <p className="muted">Call the seller to agree a time, then confirm it here. The buyer gets the address and time by SMS.</p>
      <div className="admin-card" style={{ overflowX: "auto" }}>
        <table className="table"><thead><tr><th>Vehicle</th><th>Buyer</th><th>Asked for</th><th>Status</th><th /></tr></thead>
          <tbody>{(data || []).map((i) => {
            const lot = (Array.isArray(i.lots) ? i.lots[0] : i.lots) as { id: number; title: string; suburb: string; state: string };
            const p = (Array.isArray(i.profiles) ? i.profiles[0] : i.profiles) as { first_name: string; last_name: string; mobile: string };
            return (
              <tr key={i.id}>
                <td><Link href={`/admin/lots/${lot?.id}`} style={{ fontWeight: 700 }}>{lot?.title}</Link><br /><span className="muted">{lot?.suburb} {lot?.state}</span></td>
                <td>{p?.first_name} {p?.last_name}<br /><span className="muted">{p?.mobile}</span></td>
                <td>{i.preferred_day}<br />{i.preferred_time}<br /><span className="muted">requested {dateTime(i.created_at)}</span></td>
                <td>{i.status}{i.confirmed_for && <><br />{i.confirmed_for}</>}</td>
                <td>{i.status === "requested" && <span className="pill-row"><AdminAction action="confirm-inspection" payload={{ inspectionId: i.id }} label="Confirm time" input={{ name: "when", placeholder: "e.g. Sat 3 Oct, 10:30 am" }} tone="blue" /><AdminAction action="cancel-inspection" payload={{ inspectionId: i.id }} label="Cancel" tone="soft" /></span>}</td>
              </tr>
            );
          })}</tbody></table>
      </div>
    </>
  );
}
