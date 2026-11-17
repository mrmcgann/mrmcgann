import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { STATUS_LABEL, slotLabel, whenLabel, type Slot } from "@/lib/viewings";
import { MechanicBook, MechanicDone, ViewingConfirm } from "./ViewingActions";
import { INSPECTION_STATUS, feeText } from "@/lib/inspections";

export const dynamic = "force-dynamic";

type Row = { id: string; ref: string; lot_id: number; slots: Slot[]; note: string | null; status: string; starts_at: string | null; staff_note: string | null; created_at: string; ack_at: string | null;
  lots: { title: string; suburb: string | null; state: string | null; status: string } | null;
  profiles: { first_name: string | null; last_name: string | null; mobile: string | null; email: string | null } | null };

// Book an inspection, both ways. Viewings by appointment, where the truck is kept: call the owner, agree one of the
// member's times, then confirm it here (the member gets the address, the owner gets the member's name: that record is
// the introduction in section 2 of the seller agreement and section 5 of the Terms). Nobody from Super Trucker goes.
// Our mobile mechanic: agree a time with the owner and the mechanic, book it (the member is sent the amount), record
// the payment, then close it with the report once the listing shows what was found (admin_inspection, migration 38).
type MRow = { id: string; ref: string; lot_id: number; slots: Slot[]; note: string | null; status: string; fee: number; starts_at: string | null; mechanic: string | null;
  pay_by: string | null; paid_at: string | null; paid_note: string | null; refund_due: number | null; refunded_at: string | null; staff_note: string | null; summary: string | null; created_at: string;
  lots: { title: string; suburb: string | null; state: string | null; status: string } | null;
  profiles: { first_name: string | null; last_name: string | null; mobile: string | null; email: string | null } | null };
export default async function Viewings() {
  await requireAdmin();
  const db = supabaseAdmin();
  const sel = "id, ref, lot_id, slots, note, status, starts_at, staff_note, created_at, ack_at, lots(title, suburb, state, status), profiles!viewings_user_id_fkey(first_name, last_name, mobile, email)";
  const [{ data: open }, { data: booked }, { data: recent }] = await Promise.all([
    db.from("viewings").select(sel).eq("status", "requested").order("created_at").limit(200),
    db.from("viewings").select(sel).eq("status", "confirmed").order("starts_at").limit(200),
    db.from("viewings").select(sel).not("status", "in", "(requested,confirmed)").order("status_at", { ascending: false }).limit(40),
  ]);
  const msel = "id, ref, lot_id, slots, note, status, fee, starts_at, mechanic, pay_by, paid_at, paid_note, refund_due, refunded_at, staff_note, summary, created_at, lots(title, suburb, state, status), profiles!mechanic_inspections_user_id_fkey(first_name, last_name, mobile, email)";
  const [{ data: mAsk }, { data: mDue }, { data: mPaid }, { data: mRefund }, { data: mRecent }] = await Promise.all([
    db.from("mechanic_inspections").select(msel).eq("status", "requested").order("created_at").limit(200),
    db.from("mechanic_inspections").select(msel).eq("status", "booked").order("pay_by").limit(200),
    db.from("mechanic_inspections").select(msel).eq("status", "paid").order("starts_at").limit(200),
    db.from("mechanic_inspections").select(msel).gt("refund_due", 0).is("refunded_at", null).order("status_at").limit(100),
    db.from("mechanic_inspections").select(msel).in("status", ["done", "cancelled", "declined"]).order("status_at", { ascending: false }).limit(40),
  ]);
  const rows = (d: unknown) => (d || []) as Row[];
  const mrows = (d: unknown) => (d || []) as MRow[];
  const [o, b, rc] = [rows(open), rows(booked), rows(recent)];
  const [ma, md, mp, mr, mx] = [mrows(mAsk), mrows(mDue), mrows(mPaid), mrows(mRefund), mrows(mRecent)];
  const mwho = (r: MRow) => `${r.profiles?.first_name || ""} ${r.profiles?.last_name || ""}`.trim() || r.profiles?.email || "Member";
  const mhead = (r: MRow) => (
    <span><b>{r.ref}</b> <span className="muted">${feeText(Number(r.fee))}</span><br /><Link className="blue" href={`/admin/lots/${r.lot_id}`}>{r.lots?.title}</Link> <span className="muted">({r.lots?.suburb}, {r.lots?.state})</span></span>
  );
  const mmember = (r: MRow) => <span><b>{mwho(r)}</b><br /><span className="muted">{r.profiles?.mobile} · {r.profiles?.email}</span></span>;
  const who = (r: Row) => `${r.profiles?.first_name || ""} ${r.profiles?.last_name || ""}`.trim() || r.profiles?.email || "Member";
  const head = (r: Row) => (
    <span><b>{r.ref}</b><br /><Link className="blue" href={`/admin/lots/${r.lot_id}`}>{r.lots?.title}</Link> <span className="muted">({r.lots?.suburb}, {r.lots?.state})</span></span>
  );
  const member = (r: Row) => <span><b>{who(r)}</b><br /><span className="muted">{r.profiles?.mobile} · {r.profiles?.email}</span>{r.ack_at ? <><br /><span className="muted">Agreed to the introduction terms {new Date(r.ack_at).toLocaleDateString("en-AU")}</span></> : null}</span>;
  return (
    <>
      <h1 className="d2">Viewings and inspections.</h1>
      <p className="lede" style={{ margin: 0, fontSize: 18 }}>In person, by appointment, where the truck is kept. Call the owner, agree one of the member&apos;s times, then confirm it: the member gets the address and the owner gets the member&apos;s name. Looking and listening only, no road test. Nobody from Super Trucker goes.</p>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="viewings-open">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>To agree with the owner ({o.length})</h2>
        {o.length ? o.map((r) => (
          <div key={r.id} className="vw-row">
            {head(r)}{member(r)}
            <span><span className="muted">Times that suit them:</span> {r.slots.map(slotLabel).join("; ")}{r.note ? <><br /><span className="muted">Note:</span> {r.note}</> : null}</span>
            <ViewingConfirm id={r.id} state={r.lots?.state || "QLD"} />
          </div>
        )) : <span className="muted">Nothing waiting.</span>}
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="viewings-booked">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Booked ({b.length})</h2>
        {b.length ? b.map((r) => (
          <div key={r.id} className="vw-row">
            {head(r)}{member(r)}
            <span><b>{r.starts_at ? whenLabel(r.starts_at, r.lots?.state) : ""}</b>{r.staff_note ? <><br /><span className="muted">{r.staff_note}</span></> : null}</span>
            <span className="pill-row">
              <AdminAction action="viewing" payload={{ id: r.id, do: "done" }} label="Done" tone="soft" />
              <AdminAction action="viewing" payload={{ id: r.id, do: "no_show" }} label="They didn't show" tone="soft" confirmText="Mark as missed?" />
              <AdminAction action="viewing" payload={{ id: r.id, do: "decline" }} label="Cancel it" tone="bad" input={{ name: "note", placeholder: "Why (the member sees this)" }} />
            </span>
          </div>
        )) : <span className="muted">Nothing booked.</span>}
      </div>

      <h2 className="d3" style={{ fontSize: 34, marginTop: 10 }}>Our mobile mechanic.</h2>
      <p className="lede" style={{ margin: 0, fontSize: 18 }}>A paid inspection a member books. Agree a time with the owner and the mechanic, then book it: the member is sent the amount and our bank details, the owner the time. Mark it paid when the money lands. After the visit, put anything the mechanic found on the listing&apos;s damage and wear, then close it with the report. No road test, nothing taken apart.</p>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="mechanic-open">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>To book ({ma.length})</h2>
        {ma.length ? ma.map((r) => (
          <div key={r.id} className="vw-row">
            {mhead(r)}{mmember(r)}
            <span><span className="muted">Days that suit them:</span> {r.slots.map(slotLabel).join("; ")}{r.note ? <><br /><span className="muted">Look at:</span> {r.note}</> : null}</span>
            <MechanicBook id={r.id} state={r.lots?.state || "QLD"} />
          </div>
        )) : <span className="muted">Nothing waiting.</span>}
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="mechanic-due">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Booked, waiting for payment ({md.length})</h2>
        {md.length ? md.map((r) => (
          <div key={r.id} className="vw-row">
            {mhead(r)}{mmember(r)}
            <span><b>{r.starts_at ? whenLabel(r.starts_at, r.lots?.state) : ""}</b> with {r.mechanic}<br /><span className="muted">Pay by {r.pay_by ? whenLabel(r.pay_by, r.lots?.state) : ""}, reference {r.ref}</span></span>
            <span className="pill-row">
              <AdminAction action="inspection" payload={{ id: r.id, do: "paid" }} label="Payment received" tone="blue" input={{ name: "note", placeholder: "Bank reference (optional)" }} />
              <AdminAction action="inspection" payload={{ id: r.id, do: "cancel" }} label="Cancel it" tone="bad" input={{ name: "note", placeholder: "Why (the member sees this)" }} />
            </span>
          </div>
        )) : <span className="muted">Nothing waiting for payment.</span>}
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="mechanic-paid">
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Paid, to inspect ({mp.length})</h2>
        {mp.length ? mp.map((r) => (
          <div key={r.id} className="vw-row">
            {mhead(r)}{mmember(r)}
            <span><b>{r.starts_at ? whenLabel(r.starts_at, r.lots?.state) : ""}</b> with {r.mechanic}{r.note ? <><br /><span className="muted">Look at:</span> {r.note}</> : null}</span>
            <MechanicDone id={r.id} lotId={r.lot_id} />
            <span className="pill-row"><AdminAction action="inspection" payload={{ id: r.id, do: "cancel" }} label="Cancel and refund" tone="bad" input={{ name: "note", placeholder: "Why (the member sees this)" }} /></span>
          </div>
        )) : <span className="muted">Nothing to inspect.</span>}
      </div>

      {mr.length > 0 && (
        <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="mechanic-refunds">
          <h2 style={{ fontSize: 22, fontWeight: 800 }}>Refunds to send ({mr.length})</h2>
          {mr.map((r) => (
            <div key={r.id} className="vw-row">
              {mhead(r)}{mmember(r)}
              <span><b>${feeText(Number(r.refund_due))}</b> to the account they paid from{r.paid_note ? ` (paid with ${r.paid_note})` : ""}</span>
              <span className="pill-row"><AdminAction action="inspection" payload={{ id: r.id, do: "refunded" }} label="Refund sent" tone="blue" confirmText={`Mark $${feeText(Number(r.refund_due))} as refunded?`} /></span>
            </div>
          ))}
        </div>
      )}

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 10, overflowX: "auto" }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Recent inspections</h2>
        <table className="table"><thead><tr><th>Booking</th><th>Member</th><th>Result</th></tr></thead>
          <tbody>{mx.map((r) => <tr key={r.id}><td>{mhead(r)}</td><td>{mwho(r)}</td><td>{INSPECTION_STATUS[r.status] || r.status}{r.staff_note ? `: ${r.staff_note}` : ""}{r.summary ? <><br /><span className="muted">{r.summary}</span></> : null}</td></tr>)}</tbody></table>
      </div>

      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 10, overflowX: "auto" }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Recent viewings</h2>
        <table className="table"><thead><tr><th>Booking</th><th>Member</th><th>Result</th></tr></thead>
          <tbody>{rc.map((r) => <tr key={r.id}><td>{head(r)}</td><td>{who(r)}</td><td>{STATUS_LABEL[r.status] || r.status}{r.staff_note ? `: ${r.staff_note}` : ""}</td></tr>)}</tbody></table>
      </div>
    </>
  );
}
