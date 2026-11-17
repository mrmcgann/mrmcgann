"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { useViewer } from "@/components/Viewer";
import { MAX_SLOTS, PARTS, STATUS_LABEL, VIEWING_OFF, dayLabel, slotLabel, viewingDays, whenLabel, type Slot, type Viewing } from "@/lib/viewings";
import { INSPECT_YOURSELF } from "@/lib/inspections";

// "Inspect it yourself" (a viewing by appointment): the buyer offers up to three times, we agree one with the owner and
// only then send the address. Asking needs a verified account (the owner is told who's coming) and the buyer's
// agreement to how introductions work (viewingAck, recorded on the booking by request_viewing). The other way to
// inspect it, our mobile mechanic, sits beside this (Mechanic.tsx).
export function Viewings({ lotId, title, suburb, state, inPerson, auctionAt, open }: {
  lotId: number; title: string; suburb: string; state: string; inPerson: boolean; auctionAt: string | null; open: boolean;
}) {
  const v = useViewer();
  const [mine, setMine] = useState<Viewing[]>([]);
  const [ack, setAck] = useState("");
  const [form, setForm] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch(`/api/viewings?lot=${lotId}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    setMine((r?.viewings || []) as Viewing[]);
    setAck(String(r?.ack || ""));
  }, [lotId]);
  useEffect(() => { void load(); }, [load, v.user]);
  const current = mine.find((m) => ["requested", "confirmed"].includes(m.status));

  async function cancel(id: string) {
    if (!window.confirm("Cancel this viewing? We'll let the owner know.")) return;
    await fetch(`/api/viewings/${id}`, { method: "DELETE" });
    void load();
  }

  if (!inPerson) return <div className="vw-opt insp-card" data-testid="viewing-off"><b style={{ fontSize: 17 }}>{INSPECT_YOURSELF.title}.</b><span className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>{VIEWING_OFF}</span></div>;
  return (
    <div className="vw-opt insp-card" id="viewings" data-testid="viewing">
      <div className="insp-head"><b style={{ fontSize: 17 }}>{INSPECT_YOURSELF.title}.</b><span className="insp-price">{INSPECT_YOURSELF.price}</span></div>
      <ul className="insp-lines">{INSPECT_YOURSELF.lines.map((l) => <li key={l}>{l}</li>)}</ul>
      <span className="muted" style={{ fontSize: 14 }}>Where it&apos;s kept, near {suburb}{state ? `, ${state}` : ""}.</span>
      {current ? <Booked v={current} state={state} onCancel={() => cancel(current.id)} />
        : open ? <button className="btn btn-dark" style={{ height: 46, fontSize: 15, alignSelf: "flex-start", marginTop: 4 }} onClick={() => setForm(true)} data-testid="viewing-ask">Book a time</button>
        : <span className="hint">Viewings close the day before the auction.</span>}
      {mine.filter((m) => !["requested", "confirmed"].includes(m.status)).slice(0, 3).map((m) => (
        <span key={m.id} className="hint">Viewing {m.ref}: {STATUS_LABEL[m.status] || m.status}{m.status === "declined" && m.staff_note ? `. ${m.staff_note}` : ""}</span>
      ))}
      {form && <BookForm lotId={lotId} title={title} auctionAt={auctionAt} ack={ack} onClose={() => setForm(false)} onDone={() => { setForm(false); void load(); }} />}
    </div>
  );
}

function Booked({ v, state, onCancel }: { v: Viewing; state: string; onCancel: () => void }) {
  return (
    <div className="vw-booked" data-testid="viewing-booked">
      {v.status === "confirmed" && v.starts_at
        ? <span><b>Booked: {whenLabel(v.starts_at, state)}</b>. The address is in the text and email we sent you. Bring photo ID.</span>
        : <span><b>Asked for</b> {v.slots.map(slotLabel).join("; ")}. We&apos;ll agree a time with the owner and text you.</span>}
      <span className="muted" style={{ fontSize: 13 }}>Reference {v.ref}. <button className="linkbtn" style={{ fontSize: 13 }} onClick={onCancel}>Cancel</button></span>
    </div>
  );
}

function BookForm({ lotId, title, auctionAt, ack, onClose, onDone }: { lotId: number; title: string; auctionAt: string | null; ack: string; onClose: () => void; onDone: () => void }) {
  const v = useViewer();
  const [picked, setPicked] = useState<Slot[]>([]);
  const [note, setNote] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ref, setRef] = useState<string | null>(null);
  const days = viewingDays(auctionAt);
  const here = typeof window !== "undefined" ? window.location.pathname + "#viewings" : "/";
  const need = !v.user ? "signin" : v.missing.some((n) => n !== 4) ? "verify" : null;
  const on = (s: Slot) => picked.some((p) => p.day === s.day && p.part === s.part);
  const toggle = (s: Slot) => {
    setErr("");
    if (on(s)) setPicked(picked.filter((p) => !(p.day === s.day && p.part === s.part)));
    else if (picked.length >= MAX_SLOTS) setErr(`Pick up to ${MAX_SLOTS} times. Untick one to choose another.`);
    else setPicked([...picked, s]);
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked.length) return setErr("Pick at least one time that suits you.");
    if (!agree) return setErr("Tick the box to agree to how viewings work first.");
    setBusy(true); setErr("");
    const res = await fetch("/api/viewings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, slots: picked, note, agree }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(data.error || "Couldn't send that. Please try again.");
    setRef(data.ref);
  }

  if (need) {
    return (
      <Modal title="Ask to view it." onClose={onClose}>
        <p style={{ fontSize: 17, lineHeight: 1.5, margin: 0 }}>
          {need === "signin" ? "Sign in or join first. Viewings are for verified members, because the owner is told who's coming."
            : "Viewings are for verified members, because the owner is told who's coming. Finish setting up your account (your details, mobile and ID): it's the same check as bidding."}
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
        <p style={{ fontSize: 17, lineHeight: 1.5, margin: 0 }}>We&apos;ll agree a time with the owner of the {title} and text you, usually within one business day. Your reference is <b>{ref}</b>.</p>
        <p className="hint" style={{ margin: 0 }}>The address comes with the confirmation. Bring photo ID, and a mechanic if you like. Looking and listening only: no road test.</p>
        <button className="btn btn-blue" onClick={onDone}>Done</button>
      </Modal>
    );
  }
  return (
    <Modal title="Ask to view it." onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="viewing-form">
        <span className="muted" style={{ fontSize: 15 }}>Pick up to three times that suit you, up to the day before the auction, in the truck&apos;s local time. We agree one with the owner and text you the address.</span>
        {days.length === 0 ? <div className="notice bad">The auction is too close to book a viewing. Call us and we&apos;ll see what we can do.</div> : (
          <div className="vw-days" role="group" aria-label="Times that suit you">
            {days.map((d) => (
              <div key={d} className="vw-day">
                <span className="vw-dl">{dayLabel(d)}</span>
                <span className="chipset">
                  {PARTS.map(([p, label, hours]) => {
                    const s = { day: d, part: p };
                    return <button type="button" key={p} className={on(s) ? "on" : ""} aria-pressed={on(s)} title={hours} onClick={() => toggle(s)}>{label}</button>;
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
        <span className="hint" style={{ margin: 0 }}>{PARTS.map(([, l, h]) => `${l} ${h}`).join("; ")}. {picked.length ? `${picked.length} of ${MAX_SLOTS} picked.` : ""}</span>
        <label className="field"><span>Anything we should know? (optional)</span>
          <textarea className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Bringing a mechanic, the access you need…" /></label>
        <label className="check-row" style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, lineHeight: 1.5 }} data-testid="viewing-ack">
          <input type="checkbox" checked={agree} onChange={(e) => { setAgree(e.target.checked); setErr(""); }} style={{ marginTop: 3, flexShrink: 0 }} />
          <span>{ack} <Link className="blue" href="/terms#t-intro" target="_blank" style={{ fontWeight: 700 }}>Terms, section 5</Link></span>
        </label>
        {err && <div className="notice bad" role="alert">{err}</div>}
        <button className="btn btn-blue" disabled={busy || !days.length}>{busy ? "Sending…" : "Ask for the viewing"}</button>
      </form>
    </Modal>
  );
}
