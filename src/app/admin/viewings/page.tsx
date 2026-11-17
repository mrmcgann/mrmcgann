import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { STATUS_LABEL, slotLabel, whenLabel, type Slot } from "@/lib/viewings";
import { ViewingConfirm } from "./ViewingActions";

export const dynamic = "force-dynamic";

type Row = { id: string; ref: string; lot_id: number; slots: Slot[]; note: string | null; status: string; starts_at: string | null; staff_note: string | null; created_at: string; ack_at: string | null;
  lots: { title: string; suburb: string | null; state: string | null; status: string } | null;
  profiles: { first_name: string | null; last_name: string | null; mobile: string | null; email: string | null } | null };

// Viewings by appointment, where the truck is kept. Call the owner, agree one of the member's times, then confirm
// it here: the member gets the address, the owner gets the member's name (that record is the introduction in
// section 2 of the seller agreement and section 5 of the Terms). Nobody from Super Trucker attends.
export default async function Viewings() {
  await requireAdmin();
  const db = supabaseAdmin();
  const sel = "id, ref, lot_id, slots, note, status, starts_at, staff_note, created_at, ack_at, lots(title, suburb, state, status), profiles!viewings_user_id_fkey(first_name, last_name, mobile, email)";
  const [{ data: open }, { data: booked }, { data: recent }] = await Promise.all([
    db.from("viewings").select(sel).eq("status", "requested").order("created_at").limit(200),
    db.from("viewings").select(sel).eq("status", "confirmed").order("starts_at").limit(200),
    db.from("viewings").select(sel).not("status", "in", "(requested,confirmed)").order("status_at", { ascending: false }).limit(40),
  ]);
  const rows = (d: unknown) => (d || []) as Row[];
  const [o, b, rc] = [rows(open), rows(booked), rows(recent)];
  const who = (r: Row) => `${r.profiles?.first_name || ""} ${r.profiles?.last_name || ""}`.trim() || r.profiles?.email || "Member";
  const head = (r: Row) => (
    <span><b>{r.ref}</b><br /><Link className="blue" href={`/admin/lots/${r.lot_id}`}>{r.lots?.title}</Link> <span className="muted">({r.lots?.suburb}, {r.lots?.state})</span></span>
  );
  const member = (r: Row) => <span><b>{who(r)}</b><br /><span className="muted">{r.profiles?.mobile} · {r.profiles?.email}</span>{r.ack_at ? <><br /><span className="muted">Agreed to the introduction terms {new Date(r.ack_at).toLocaleDateString("en-AU")}</span></> : null}</span>;
  return (
    <>
      <h1 className="d2">Viewings.</h1>
      <p className="lede" style={{ margin: 0, fontSize: 18 }}>In person, by appointment, where the truck is kept. Call the owner, agree one of the member&apos;s times, then confirm it: the member gets the address and the owner gets the member&apos;s name. Looking and listening only, no road test. Nobody from Super Trucker goes.</p>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="viewings-open">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>To agree with the owner ({o.length})</h2>
        {o.length ? o.map((r) => (
          <div key={r.id} className="vw-row">
            {head(r)}{member(r)}
            <span><span className="muted">Times that suit them:</span> {r.slots.map(slotLabel).join("; ")}{r.note ? <><br /><span className="muted">Note:</span> {r.note}</> : null}</span>
            <ViewingConfirm id={r.id} />
          </div>
        )) : <span className="muted">Nothing waiting.</span>}
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="viewings-booked">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Booked ({b.length})</h2>
        {b.length ? b.map((r) => (
          <div key={r.id} className="vw-row">
            {head(r)}{member(r)}
            <span><b>{r.starts_at ? whenLabel(r.starts_at) : ""}</b>{r.staff_note ? <><br /><span className="muted">{r.staff_note}</span></> : null}</span>
            <span className="pill-row">
              <AdminAction action="viewing" payload={{ id: r.id, do: "done" }} label="Done" tone="soft" />
              <AdminAction action="viewing" payload={{ id: r.id, do: "no_show" }} label="They didn't show" tone="soft" confirmText="Mark as missed?" />
              <AdminAction action="viewing" payload={{ id: r.id, do: "decline" }} label="Cancel it" tone="bad" input={{ name: "note", placeholder: "Why (the member sees this)" }} />
            </span>
          </div>
        )) : <span className="muted">Nothing booked.</span>}
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 10, overflowX: "auto" }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Recent</h2>
        <table className="table"><thead><tr><th>Booking</th><th>Member</th><th>Result</th></tr></thead>
          <tbody>{rc.map((r) => <tr key={r.id}><td>{head(r)}</td><td>{who(r)}</td><td>{STATUS_LABEL[r.status] || r.status}{r.staff_note ? `: ${r.staff_note}` : ""}</td></tr>)}</tbody></table>
      </div>
    </>
  );
}
