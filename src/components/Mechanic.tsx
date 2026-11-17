"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { useViewer } from "@/components/Viewer";
import { PayBox } from "@/components/deposit/PayBox";
import { payBank } from "@/lib/env";
import { dayLabel, slotLabel, whenLabel, type Slot } from "@/lib/viewings";
import {
  INSPECTION_STATUS, MECHANIC_CHECKS, MECHANIC_LIMITS, MECHANIC_MAX_SLOTS, MECHANIC_PARTS, cancelTerms, feeText, inspectionDays, isOpen,
  mechanicOption, type Inspection,
} from "@/lib/inspections";

// "Send our mobile mechanic": the second way to inspect a truck before the auction (the first is a viewing,
// Viewings.tsx). The member offers up to three days; staff agree a time with the owner and the mechanic; the member pays
// by bank transfer; the report comes back here. Booking needs a verified account and the member's agreement to how it
// works (inspectionAck, stored on the booking by request_inspection). Anything the mechanic finds goes on the listing.
type Row = Inspection & { has_report?: boolean };

export function Mechanic({ lotId, title, state, auctionAt, open, fee: feeProp }: {
  lotId: number; title: string; state: string; auctionAt: string | null; open: boolean; fee: number;
}) {
  const v = useViewer();
  const [mine, setMine] = useState<Row[]>([]);
  const [ack, setAck] = useState("");
  const [fee, setFee] = useState(feeProp);
  const [form, setForm] = useState(false);
  const [more, setMore] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch(`/api/inspections?lot=${lotId}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    setMine((r?.inspections || []) as Row[]);
    setAck(String(r?.ack || ""));
    if (Number.isFinite(Number(r?.fee))) setFee(Number(r.fee));
  }, [lotId]);
  useEffect(() => { void load(); }, [load, v.user]);
  const current = mine.find(isOpen) || mine.find((m) => m.status === "done");
  const opt = mechanicOption(fee);

  async function cancel(i: Row) {
    const t = cancelTerms(i);
    if (!t.can) return window.alert(t.why || "That booking can't be cancelled online. Call us.");
    if (!window.confirm(`Cancel inspection ${i.ref}? ${t.why} We'll let the owner know.`)) return;
    const res = await fetch(`/api/inspections/${i.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) window.alert(d.error || "Couldn't cancel it. Call us.");
    void load();
  }

  return (
    <div className="vw-opt insp-card" id="mechanic" data-testid="mechanic">
      <div className="insp-head"><b style={{ fontSize: 17 }}>{opt.title}.</b><span className="insp-price mech">{opt.price}</span></div>
      <ul className="insp-lines">{opt.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      <button type="button" className="linkbtn" style={{ alignSelf: "flex-start", fontSize: 14 }} onClick={() => setMore(!more)} aria-expanded={more}>{more ? "Less" : "What the mechanic checks"}</button>
      {more && (
        <div className="insp-more" data-testid="mechanic-checks">
          <ul className="insp-lines">{MECHANIC_CHECKS.map((c) => <li key={c}>{c}.</li>)}</ul>
          <span className="hint" style={{ margin: 0 }}>{MECHANIC_LIMITS} Anything they find goes on the listing for every bidder, and the owner is told.</span>
        </div>
      )}
      {current ? <Booking i={current} state={state} onCancel={() => cancel(current)} />
        : open ? <button className="btn btn-dark" style={{ height: 46, fontSize: 15, alignSelf: "flex-start", marginTop: 4 }} onClick={() => setForm(true)} data-testid="mechanic-ask">Book our mechanic</button>
        : <span className="hint">Inspections close the day before the auction.</span>}
      {mine.filter((m) => m !== current && !isOpen(m)).slice(0, 3).map((m) => (
        <span key={m.id} className="hint">Inspection {m.ref}: {INSPECTION_STATUS[m.status] || m.status}{m.staff_note && ["cancelled", "declined"].includes(m.status) ? `. ${m.staff_note}` : ""}
          {Number(m.refund_due) > 0 ? (m.refunded_at ? ` Refunded $${feeText(Number(m.refund_due))}.` : ` Refund of $${feeText(Number(m.refund_due))} on its way.`) : ""}</span>
      ))}
      {form && <BookForm lotId={lotId} title={title} auctionAt={auctionAt} ack={ack} fee={fee} onClose={() => setForm(false)} onDone={() => { setForm(false); void load(); }} />}
    </div>
  );
}

function Booking({ i, state, onCancel }: { i: Row; state: string; onCancel: () => void }) {
  const when = i.starts_at ? whenLabel(i.starts_at, state) : null;
  return (
    <div className="vw-booked" data-testid="mechanic-booked" data-status={i.status}>
      {i.status === "requested" && <span><b>Asked for</b> {i.slots.map(slotLabel).join("; ")}. We&apos;ll agree a time with the owner and our mechanic, then send you the amount to pay.</span>}
      {i.status === "booked" && (
        <>
          <span><b>Booked: {when}</b>{i.mechanic ? `, with ${i.mechanic}` : ""}. You don&apos;t need to be there.</span>
          <span>Pay <b>${feeText(Number(i.fee))}</b> (including GST) by {i.pay_by ? whenLabel(i.pay_by, state) : "the time we gave you"}, or the booking lapses.</span>
          <PayBox amount={Number(i.fee)} reference={i.ref} bank={payBank()} payIdOn={false} note={<>Use the reference <b>{i.ref}</b> so we can match it to your booking.</>} />
        </>
      )}
      {i.status === "paid" && (
        <span><b>Booked and paid: {when}</b>{i.mechanic ? `, with ${i.mechanic}` : ""}. The report comes to you, usually by the end of the next business day. <a className="blue" href={`/api/inspections/${i.id}/invoice`} style={{ fontWeight: 700 }}>Tax invoice</a></span>
      )}
      {i.status === "done" && (
        <>
          <span><b>Report ready</b>{i.done_at ? ` (${new Date(i.done_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })})` : ""}.</span>
          {i.summary && <span className="muted" style={{ fontSize: 15 }} data-testid="mechanic-summary">{i.summary}</span>}
          <span><a className="blue" href={`/api/inspections/${i.id}/report`} style={{ fontWeight: 700 }} rel="nofollow">Read the full report ›</a> · <a className="blue" href={`/api/inspections/${i.id}/invoice`}>Tax invoice</a></span>
          <span className="hint" style={{ margin: 0 }}>Anything the mechanic found is on this listing&apos;s damage and wear, for every bidder.</span>
        </>
      )}
      <span className="muted" style={{ fontSize: 13 }}>Reference {i.ref}.{isOpen(i) && <> <button className="linkbtn" style={{ fontSize: 13 }} onClick={onCancel}>Cancel</button></>}</span>
    </div>
  );
}

function BookForm({ lotId, title, auctionAt, ack, fee, onClose, onDone }: {
  lotId: number; title: string; auctionAt: string | null; ack: string; fee: number; onClose: () => void; onDone: () => void;
}) {
  const v = useViewer();
  const [picked, setPicked] = useState<Slot[]>([]);
  const [note, setNote] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ref, setRef] = useState<string | null>(null);
  const days = inspectionDays(auctionAt);
  const here = typeof window !== "undefined" ? window.location.pathname + "#mechanic" : "/";
  const need = !v.user ? "signin" : v.missing.some((n) => n !== 4) ? "verify" : null;
  const on = (s: Slot) => picked.some((p) => p.day === s.day && p.part === s.part);
  const toggle = (s: Slot) => {
    setErr("");
    if (on(s)) setPicked(picked.filter((p) => !(p.day === s.day && p.part === s.part)));
    else if (picked.length >= MECHANIC_MAX_SLOTS) setErr(`Pick up to ${MECHANIC_MAX_SLOTS}. Untick one to choose another.`);
    else setPicked([...picked, s]);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked.length) return setErr("Pick at least one day that suits you.");
    if (!agree) return setErr("Tick the box to agree to how the inspection works first.");
    setBusy(true); setErr("");
    const res = await fetch("/api/inspections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, slots: picked, note, agree }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(data.error || "Couldn't send that. Please try again.");
    setRef(data.ref);
  }

  if (need) {
    return (
      <Modal title="Book our mechanic." onClose={onClose}>
        <p style={{ fontSize: 17, lineHeight: 1.5, margin: 0 }}>
          {need === "signin" ? "Sign in or join first. Booking our mechanic is for verified members." : "Booking our mechanic is for verified members. Finish setting up your account (your details, mobile and ID): it's the same check as bidding."}
        </p>
        <div className="pill-row">
          <Link className="btn btn-blue" href={need === "signin" ? `/signin?next=${encodeURIComponent(here)}` : `/join?next=${encodeURIComponent(here)}`}>{need === "signin" ? "Sign in" : "Finish setting up"}</Link>
          {need === "signin" && <Link className="btn btn-soft" href={`/join?next=${encodeURIComponent(here)}`}>Join free</Link>}
        </div>
      </Modal>
    );
  }
  if (ref) {
    return (
      <Modal title="Thanks, we've got it." onClose={onDone}>
        <p style={{ fontSize: 17, lineHeight: 1.5, margin: 0 }}>We&apos;ll agree a time with the owner of the {title} and our mechanic, usually within one business day, then send you the amount to pay (${feeText(fee)} including GST). Your reference is <b>{ref}</b>.</p>
        <p className="hint" style={{ margin: 0 }}>You don&apos;t need to be there. The report comes to you, and anything the mechanic finds goes on the listing for every bidder.</p>
        <button className="btn btn-blue" onClick={onDone}>Done</button>
      </Modal>
    );
  }
  return (
    <Modal title="Book our mechanic." onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="mechanic-form">
        <span className="muted" style={{ fontSize: 15 }}>Pick up to three mornings or afternoons that suit you, up to the day before the auction. We agree one with the owner and our mechanic, then send you the amount to pay: ${feeText(fee)} including GST.</span>
        {days.length === 0 ? <div className="notice bad">The auction is too close to fit an inspection in. Call us and we&apos;ll see what we can do.</div> : (
          <div className="vw-days" role="group" aria-label="Days that suit you">
            {days.map((d) => (
              <div key={d} className="vw-day">
                <span className="vw-dl">{dayLabel(d)}</span>
                <span className="chipset">
                  {MECHANIC_PARTS.map(([p, label, hours]) => {
                    const s = { day: d, part: p };
                    return <button type="button" key={p} className={on(s) ? "on" : ""} aria-pressed={on(s)} title={hours} onClick={() => toggle(s)}>{label}</button>;
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
        <span className="hint" style={{ margin: 0 }}>{MECHANIC_PARTS.map(([, l, h]) => `${l} ${h}`).join("; ")}, in the truck&apos;s local time. {picked.length ? `${picked.length} of ${MECHANIC_MAX_SLOTS} picked.` : ""}</span>
        <label className="field"><span>Anything you want the mechanic to look at? (optional)</span>
          <textarea className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="The hoist, the tailgate loader, an oil leak in the photos…" /></label>
        <label className="check-row" style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, lineHeight: 1.5 }} data-testid="mechanic-ack">
          <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setErr(""); }} style={{ marginTop: 3, flexShrink: 0 }} />
          <span>{ack} <Link className="blue" href="/terms#t-mechanic" target="_blank" style={{ fontWeight: 700 }}>Terms, section 5</Link></span>
        </label>
        {err && <div className="notice bad" role="alert">{err}</div>}
        <button className="btn btn-blue" disabled={busy || !days.length}>{busy ? "Sending…" : `Book our mechanic, $${feeText(fee)}`}</button>
      </form>
    </Modal>
  );
}
