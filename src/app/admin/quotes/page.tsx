import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { dateTime } from "@/lib/format";

export default async function Quotes() {
  await requireAdmin(); // checked on every page, not just the layout
  const { data } = await supabaseAdmin().from("quote_requests").select("*, lots(id, title, suburb, state)").order("created_at", { ascending: false }).limit(200);
  return (
    <>
      <h1 className="d2">Transport quotes.</h1>
      <p className="muted">Get a price from your transport partner, email it to the buyer, then record it here.</p>
      <div className="admin-card" style={{ overflowX: "auto" }}>
        <table className="table"><thead><tr><th>Vehicle</th><th>To</th><th>Buyer</th><th>Status</th><th /></tr></thead>
          <tbody>{(data || []).map((q) => {
            const lot = (Array.isArray(q.lots) ? q.lots[0] : q.lots) as { id: number; title: string; suburb: string; state: string } | null;
            return (
              <tr key={q.id}>
                <td><Link href={`/lot/${lot?.id}`} style={{ fontWeight: 700 }}>{lot?.title}</Link><br /><span className="muted">from {lot?.suburb} {lot?.state}</span></td>
                <td>{q.postcode}</td>
                <td>{q.email}<br /><span className="muted">{dateTime(q.created_at)}</span></td>
                <td>{q.status}{q.quote_note && <><br />{q.quote_note}</>}</td>
                <td>{q.status === "new" && <AdminAction action="quote" payload={{ quoteId: q.id }} label="Record quote sent" input={{ name: "note", placeholder: "e.g. $850, 5 days" }} tone="blue" />}</td>
              </tr>
            );
          })}</tbody></table>
      </div>
    </>
  );
}
