import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { dateTime } from "@/lib/format";

export default async function Collections({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin(); // checked on every page, not just the layout
  const { status = "requested" } = await searchParams;
  const db = supabaseAdmin();
  let q = db.from("collections").select("*, lots(id, title, suburb, state), profiles(first_name, last_name, mobile)").order("created_at", { ascending: false }).limit(200);
  if (status !== "all") q = q.eq("status", status);
  const { data } = await q;
  const lotIds = (data || []).map((c) => c.lot_id);
  const { data: priv } = await db.from("lot_private").select("lot_id, seller_name, seller_phone, seller_address").in("lot_id", lotIds.length ? lotIds : [0]);
  const seller = new Map((priv || []).map((p) => [p.lot_id, p]));
  return (
    <>
      <h1 className="d2">Collections.</h1>
      <p className="muted">Call the seller to agree a time within the buyer&apos;s preference, then confirm it here. The buyer gets the address and release code; the seller gets the collector&apos;s name and their handover link.</p>
      <div className="pill-row">{["requested", "confirmed", "collected", "all"].map((s) => <Link key={s} className="pill pill-soft" href={`/admin/collections?status=${s}`} style={status === s ? { background: "var(--ink)", color: "#FFFFFF" } : undefined}>{s}</Link>)}</div>
      <div className="admin-card" style={{ overflowX: "auto" }}>
        <table className="table"><thead><tr><th>Vehicle</th><th>Buyer / collector</th><th>Seller</th><th>Time</th><th /></tr></thead>
          <tbody>{(data || []).map((c) => {
            const lot = (Array.isArray(c.lots) ? c.lots[0] : c.lots) as { id: number; title: string; suburb: string; state: string } | null;
            const b = (Array.isArray(c.profiles) ? c.profiles[0] : c.profiles) as { first_name: string; last_name: string; mobile: string } | null;
            const s = seller.get(c.lot_id);
            return (
              <tr key={c.id}>
                <td><Link href={`/lot/${lot?.id}`} style={{ fontWeight: 700 }}>{lot?.title}</Link><br /><span className="muted">{lot?.suburb} {lot?.state}</span></td>
                <td>{b?.first_name} {b?.last_name} · {b?.mobile}{c.collector_name && <><br />Collector: {c.collector_name} · {c.collector_mobile}</>}{c.carrier_ref && <><br />Carrier ref {c.carrier_ref}</>}</td>
                <td>{s?.seller_name} · {s?.seller_phone}<br /><span className="muted">{s?.seller_address}</span></td>
                <td>Wants: {c.preferred_day}, {c.preferred_time}<br />{c.confirmed_for && <b>Confirmed: {c.confirmed_for}</b>}{c.collected_at && <><br />Collected {dateTime(c.collected_at)}{c.handover?.odometer ? ` · ${c.handover.odometer} km · ${c.handover.keys} keys` : ""}</>}</td>
                <td><span className="pill-row">
                  {["requested", "confirmed"].includes(c.status) && <AdminAction action="confirm-collection" payload={{ collectionId: c.id }} label={c.status === "confirmed" ? "Change time" : "Confirm time"} input={{ name: "when", placeholder: "e.g. Sat 12 Oct, 10 am" }} tone="blue" />}
                  {c.status !== "collected" && c.status !== "cancelled" && <AdminAction action="cancel-collection" payload={{ collectionId: c.id }} label="Cancel" confirmText="Cancel this booking?" tone="bad" />}
                  {c.status !== "cancelled" && <AdminAction action="tracking" payload={{ collectionId: c.id }} label={c.tracking_url ? "Change tracking link" : "Add carrier tracking link"} input={{ name: "url", placeholder: "https://…" }} tone="soft" />}
                </span></td>
              </tr>
            );
          })}</tbody></table>
      </div>
    </>
  );
}
