import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { money, dateLong, dateTime } from "@/lib/format";

export default async function Sales() {
  const db = supabaseAdmin();
  const { data: lots } = await db.from("lots").select("id, title, status, current_bid, leader_id, decision_by").in("status", ["referred", "offers"]).order("decision_by");
  const ids = (lots || []).map((l) => l.id);
  const [{ data: priv }, { data: offers }] = await Promise.all([
    db.from("lot_private").select("lot_id, reserve_price, seller_name, seller_phone").in("lot_id", ids.length ? ids : [0]),
    db.from("offers").select("id, lot_id, amount, status, created_at, profiles(first_name, last_name, mobile)").in("lot_id", ids.length ? ids : [0]).order("amount", { ascending: false }),
  ]);
  const leaders = (lots || []).map((l) => l.leader_id).filter(Boolean);
  const { data: people } = await db.from("profiles").select("id, first_name, last_name, mobile").in("id", leaders.length ? leaders : ["00000000-0000-0000-0000-000000000000"]);
  const who = (id: string | null) => { const p = people?.find((x) => x.id === id); return p ? `${p.first_name} ${p.last_name} · ${p.mobile}` : "–"; };
  return (
    <>
      <h1 className="d2">Referrals &amp; offers.</h1>
      <p className="muted">Call the seller, then record their decision here. Accepting creates the invoice and charges the buyer straight away.</p>
      {!lots?.length && <div className="empty"><b>Nothing waiting on a seller.</b></div>}
      {(lots || []).map((l) => {
        const pr = priv?.find((x) => x.lot_id === l.id);
        const lotOffers = (offers || []).filter((o) => o.lot_id === l.id);
        return (
          <div className="admin-card" key={l.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div><Link href={`/admin/lots/${l.id}`} style={{ fontSize: 20, fontWeight: 800 }}>{l.title}</Link><br /><span className="muted">Lot {l.id} · Seller: {pr?.seller_name} {pr?.seller_phone} · Reserve {money(pr?.reserve_price)}</span></div>
              <span className="tag" style={{ background: "var(--sun)" }}>{l.status === "referred" ? "Referred" : "Make an offer"} · decide by {dateLong(l.decision_by)}</span>
            </div>
            {l.status === "referred" && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", padding: 14, borderRadius: 14, background: "var(--panel)" }}>
                <span>Highest bid <b>{money(l.current_bid)}</b> from {who(l.leader_id)}</span>
                <span className="pill-row">
                  <AdminAction action="accept" payload={{ lotId: l.id }} label="Seller accepts" confirmText={`Sell for ${money(l.current_bid)} and charge the buyer?`} tone="blue" />
                  <AdminAction action="decline-referral" payload={{ lotId: l.id }} label="Seller declines" confirmText="Decline and open offers?" tone="soft" />
                </span>
              </div>
            )}
            {lotOffers.length > 0 && (
              <table className="table"><thead><tr><th>Offer</th><th>From</th><th>When</th><th>Status</th><th /></tr></thead>
                <tbody>{lotOffers.map((o) => {
                  const pp = (Array.isArray(o.profiles) ? o.profiles[0] : o.profiles) as { first_name: string; last_name: string; mobile: string } | null;
                  return (
                    <tr key={o.id}><td><b>{money(o.amount)}</b></td><td>{pp?.first_name} {pp?.last_name} · {pp?.mobile}</td><td>{dateTime(o.created_at)}</td><td>{o.status}</td>
                      <td>{o.status === "pending" && <span className="pill-row"><AdminAction action="accept" payload={{ lotId: l.id, offerId: o.id }} label="Accept" confirmText={`Accept ${money(o.amount)} and charge?`} tone="blue" /><AdminAction action="decline-offer" payload={{ offerId: o.id }} label="Decline" tone="soft" /></span>}</td></tr>
                  );
                })}</tbody></table>
            )}
          </div>
        );
      })}
    </>
  );
}
