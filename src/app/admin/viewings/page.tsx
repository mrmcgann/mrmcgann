import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { KIND_LABEL, STATUS_LABEL, slotLabel, whenLabel, type Slot } from "@/lib/viewings";
import { ViewingConfirm } from "./ViewingActions";

export const dynamic = "force-dynamic";

type Row = { id: string; ref: string; lot_id: number; kind: "video" | "in_person"; slots: Slot[]; note: string | null; status: string; starts_at: string | null; host: string | null; staff_note: string | null; created_at: string;
  lots: { title: string; suburb: string | null; state: string | null; ends_at: string | null; status: string } | null;
  profiles: { first_name: string | null; last_name: string | null; mobile: string | null; email: string | null } | null };

// Viewings: video walkarounds and in-person viewings by appointment. Confirm a time from the buyer's choices; the
// buyer (and the seller, when they host) are told by text and email, with a reminder about an hour before.
export default async function Viewings() {
  await requireAdmin();
  const db = supabaseAdmin();
  const sel = "id, ref, lot_id, kind, slots, note, status, starts_at, host, staff_note, created_at, lots(title, suburb, state, ends_at, status), profiles!viewings_user_id_fkey(first_name, last_name, mobile, email)";
  const [{ data: open }, { data: booked }, { data: recent }] = await Promise.all([
    db.from("viewings").select(sel).eq("status", "requested").order("created_at").limit(200),
    db.from("viewings").select(sel).eq("status", "confirmed").order("starts_at").limit(200),
    db.from("viewings").select(sel).not("status", "in", "(requested,confirmed)").order("status_at", { ascending: false }).limit(40),
  ]);
  const rows = (d: unknown) => (d || []) as Row[];
  const [o, b, rc] = [rows(open), rows(booked), rows(recent)];
  const who = (r: Row) => `${r.profiles?.first_name || ""} ${r.profiles?.last_name || ""}`.trim() || r.profiles?.email || "Member";
  const head = (r: Row) => (
    <span><b>{KIND_LABEL[r.kind]}</b> · {r.ref}<br /><Link className="blue" href={`/lot/${r.lot_id}`}>{r.lots?.title}</Link> <span className="muted">({r.lots?.suburb}, {r.lots?.state}{r.lots?.ends_at && r.lots.status === "live" ? `; bidding closes ${whenLabel(r.lots.ends_at)}` : ""})</span></span>
  );
  const buyer = (r: Row) => <span><b>{who(r)}</b><br /><span className="muted">{r.profiles?.mobile} · {r.profiles?.email}</span></span>;
  return (
    <>
      <h1 className="d2">Viewings.</h1>
      <p className="lede" style={{ margin: 0, fontSize: 18 }}>Free video walkarounds, and in-person viewings strictly by appointment. Pick one of the buyer&apos;s times and confirm it: they get a text and email (the address only for an in-person viewing), and a reminder about an hour before. Viewing only, never test drives.</p>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="viewings-open">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>To confirm ({o.length})</h2>
        {o.length ? o.map((r) => (
          <div key={r.id} className="vw-row">
            {head(r)}{buyer(r)}
            <span><span className="muted">Times that suit them:</span> {r.slots.map(slotLabel).join(" · ")}{r.note ? <><br /><span className="muted">Note:</span> {r.note}</> : null}</span>
            <ViewingConfirm id={r.id} kind={r.kind} defaultHost={r.kind === "in_person" ? "seller" : "consultant"} />
          </div>
        )) : <span className="muted">Nothing waiting.</span>}
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="viewings-booked">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Booked ({b.length})</h2>
        {b.length ? b.map((r) => (
          <div key={r.id} className="vw-row">
            {head(r)}{buyer(r)}
            <span><b>{r.starts_at ? whenLabel(r.starts_at) : ""}</b> · {r.host === "seller" ? "seller hosts" : "our consultant hosts"}{r.staff_note ? <><br /><span className="muted">{r.staff_note}</span></> : null}</span>
            <span className="pill-row">
              <AdminAction action="viewing" payload={{ id: r.id, do: "done" }} label="Done" tone="soft" />
              <AdminAction action="viewing" payload={{ id: r.id, do: "no_show" }} label="They didn't show" tone="soft" confirmText="Mark as missed?" />
              <AdminAction action="viewing" payload={{ id: r.id, do: "decline" }} label="Cancel it" tone="bad" input={{ name: "note", placeholder: "Why (the buyer sees this)" }} />
            </span>
          </div>
        )) : <span className="muted">Nothing booked.</span>}
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 10, overflowX: "auto" }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Recent</h2>
        <table className="table"><thead><tr><th>Booking</th><th>Buyer</th><th>Result</th></tr></thead>
          <tbody>{rc.map((r) => <tr key={r.id}><td>{head(r)}</td><td>{who(r)}</td><td>{STATUS_LABEL[r.status] || r.status}{r.staff_note ? `: ${r.staff_note}` : ""}</td></tr>)}</tbody></table>
      </div>
    </>
  );
}
