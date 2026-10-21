import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { dateTime } from "@/lib/format";
import { TRANSPORT_STATUS, shortDay, windowLabel, type TransportStatus } from "@/lib/transport";
import { TRANSFER_STATUS } from "@/lib/transfer";
import type { Depot } from "@/lib/types";
import { TransportActions, type JobRow } from "./TransportActions";

type Row = JobRow & {
  ref: string; lot_id: number; invoice_id: string; created_at: string; picked_up_at: string | null; pickup_odometer: number | null; pickup_keys: number | null;
  condition_note: string | null; at_depot_at: string | null; released_at: string | null; buyer_decided_at: string | null; staff_note: string | null; carrier_ref: string | null;
  lots: { title: string; keys: number | null; runs: string | null; registration: string | null } | null; invoices: { ref: string } | null;
  profiles: { first_name: string | null; last_name: string | null; mobile: string | null } | null;
};
const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] : x);
const OPEN: TransportStatus[] = ["to_book", "booked", "picked_up", "at_depot"];
const TONE: Record<string, string> = { to_book: "var(--sun)", booked: "var(--sky)", picked_up: "var(--lilac)", at_depot: "var(--mint)", released: "var(--panel)", returned: "var(--panel)", cancelled: "var(--panel)" };

// Pickups: after a vehicle is paid for, our transport partner collects it from the seller and takes it to a depot,
// where the buyer collects it. Book it, record the pickup (with the driver's check against the listing), and mark it
// at the depot. The seller's details stay here: buyers never see them.
export default async function Transport({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireAdmin(); // checked on every page, not just the layout
  const { show = "open" } = await searchParams;
  const db = supabaseAdmin();
  let q = db.from("transport_jobs").select("*, lots(title, keys, runs, registration), invoices(ref), profiles!transport_jobs_buyer_id_fkey(first_name, last_name, mobile)")
    .order("created_at", { ascending: true }).limit(200);
  q = show === "open" ? q.in("status", OPEN) : show === "all" ? q : q.eq("status", show);
  const { data } = await q;
  const rows = (data || []) as unknown as Row[];
  const lotIds = rows.map((r) => r.lot_id), invIds = rows.map((r) => r.invoice_id);
  const [{ data: priv }, { data: depots }, { data: transfers }] = await Promise.all([
    db.from("lot_private").select("lot_id, seller_name, seller_phone, seller_address, pickup_notes").in("lot_id", lotIds.length ? lotIds : [0]),
    db.from("depots").select("id, name, suburb, state, postcode, hours, active").order("state").order("suburb"),
    db.from("ownership_transfers").select("invoice_id, status").in("invoice_id", invIds.length ? invIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const seller = new Map((priv || []).map((p) => [p.lot_id, p]));
  const depot = new Map(((depots || []) as Depot[]).map((d) => [d.id, d]));
  const transfer = new Map((transfers || []).map((t) => [t.invoice_id, t.status as string]));

  return (
    <>
      <h1 className="d2">Pickups.</h1>
      <p className="muted">Each paid vehicle is picked up from the seller by our transport partner and taken to a depot, where the buyer collects it once the transfer of ownership is done. Send the booking to the partner, record the day, then the pickup (the driver checks it against the listing) and its arrival. The seller&apos;s name, address and phone are for our partner only: never give them to a buyer.</p>
      <div className="pill-row">{[["open", "Open"], ["to_book", "To book"], ["booked", "Booked"], ["picked_up", "On the way"], ["at_depot", "At the depot"], ["released", "Collected"], ["all", "All"]].map(([k, l]) => (
        <Link key={k} className="pill pill-soft" href={`/admin/transport?show=${k}`} style={show === k ? { background: "var(--ink)", color: "#FFFFFF" } : undefined}>{l}</Link>))}</div>
      {rows.length === 0 && <div className="empty"><b>Nothing here.</b><span className="muted">A pickup appears here as soon as a vehicle is paid for in full.</span></div>}
      {rows.map((j) => {
        const lot = one(j.lots), inv = one(j.invoices), buyer = one(j.profiles), s = seller.get(j.lot_id), d = j.depot_id ? depot.get(j.depot_id) : null;
        const tr = transfer.get(j.invoice_id);
        return (
          <div className="admin-card" key={j.id} style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="admin-pickup">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
              <b style={{ fontSize: 18 }}>{j.ref} · <Link href={`/admin/lots/${j.lot_id}`}>{lot?.title}</Link></b>
              <span className="tag" style={{ background: TONE[j.status] }} data-testid="pickup-status">{TRANSPORT_STATUS[j.status]}{j.sale_cancelled_at ? " · sale cancelled" : ""}</span>
            </div>
            <span className="muted" style={{ fontSize: 14 }}>Invoice {inv?.ref} · paid {dateTime(j.created_at)} · transfer of ownership: {tr ? TRANSFER_STATUS[tr] || tr : "–"} · buyer {buyer?.first_name} {buyer?.last_name} {buyer?.mobile}</span>
            <div className="grid2" style={{ gap: 14 }}>
              <div className="soft" style={{ gap: 4 }}>
                <b>From the seller</b>
                <span>{s?.seller_name || "No name"} · {s?.seller_phone || "no phone"}</span>
                <span>{s?.seller_address || <span className="errmsg">No pickup address: add it on the vehicle</span>}</span>
                {s?.pickup_notes && <span className="muted" style={{ fontSize: 14 }}>Notes: {s.pickup_notes}</span>}
                <span className="muted" style={{ fontSize: 14 }}>{lot?.registration === "unregistered" ? "Unregistered" : "Registered"} · {lot?.runs === "drives" ? "starts and drives" : lot?.runs === "starts" ? "starts, doesn't drive" : "doesn't start or untested"} · {lot?.keys ?? "?"} keys</span>
              </div>
              <div className="soft" style={{ gap: 4 }}>
                <b>To the depot</b>
                <span>{d ? `${d.name} · ${d.suburb}, ${d.state}` : <span className="errmsg">No depot chosen</span>}</span>
                {j.pickup_on && <span>Pickup {shortDay(j.pickup_on)}, {windowLabel(j.pickup_window).toLowerCase()}{j.carrier_ref ? ` · carrier ref ${j.carrier_ref}` : ""}</span>}
                {j.picked_up_at && <span>Picked up {dateTime(j.picked_up_at)}{j.pickup_odometer ? ` · ${j.pickup_odometer.toLocaleString("en-AU")} km` : ""}{j.pickup_keys != null ? ` · ${j.pickup_keys} keys` : ""}</span>}
                {j.condition_ok === false && <span className="notice bad" style={{ fontSize: 14 }}>Driver noted: {String(j.condition_note || "").replace(/[.\s]+$/, "")}. Buyer: {j.buyer_decision === "proceed" ? "going ahead" : j.buyer_decision === "cancel" ? "wants to cancel (cancel and refund the invoice)" : "hasn't answered yet (call them after 2 business days)"}</span>}
                {j.at_depot_at && <span>At the depot {dateTime(j.at_depot_at)}</span>}
                {j.released_at && <span>Collected {dateTime(j.released_at)}</span>}
                {j.staff_note && <span className="muted" style={{ fontSize: 14, whiteSpace: "pre-line" }}>Note: {j.staff_note}</span>}
              </div>
            </div>
            <TransportActions job={j} depots={(depots || []) as Depot[]} />
          </div>
        );
      })}
    </>
  );
}
