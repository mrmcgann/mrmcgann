"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/Modal";
import { useViewer } from "@/components/Viewer";
import { KIND_LABEL, MAX_SLOTS, PARTS, STATUS_LABEL, dayLabel, slotLabel, viewingDays, whenLabel, type Slot, type Viewing, type ViewingKind } from "@/lib/viewings";

// "See it before you bid": a free video walkaround, or (when the seller allows it) an in-person viewing strictly by
// appointment. The buyer offers up to three times; we confirm one by text and email. Mechanical inspections sit
// beside this (MechanicalInspection in Partners.tsx).
export function Viewings({ lotId, title, suburb, state, inPerson, endsAt, auction, open }: {
  lotId: number; title: string; suburb: string; state: string; inPerson: boolean; endsAt: string | null; auction: boolean; open: boolean;
}) {
  const v = useViewer();
  const [mine, setMine] = useState<Viewing[]>([]);
  const [form, setForm] = useState<ViewingKind | null>(null);
  const load = useCallback(async () => {
    if (!v.user) { setMine([]); return; }
    const r = await fetch(`/api/viewings?lot=${lotId}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    setMine((r?.viewings || []) as Viewing[]);
  }, [lotId, v.user]);
  useEffect(() => { void load(); }, [load]);
  const openOf = (k: ViewingKind) => mine.find((m) => m.kind === k && ["requested", "confirmed"].includes(m.status));

  async function cancel(id: string) {
    if (!confirm("Cancel this booking?")) return;
    await fetch(`/api/viewings/${id}`, { method: "DELETE" });
    void load();
  }

  const card = (k: ViewingKind, head: string, body: React.ReactNode, button: string, available: boolean, unavailable?: string) => {
    const cur = openOf(k);
    return (
      <div className="vw-opt" data-testid={`viewing-${k}`}>
        <b style={{ fontSize: 17 }}>{head}</b>
        <span className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>{body}</span>
        {cur ? <Booked v={cur} onCancel={() => cancel(cur.id)} />
          : available && open ? <button className="btn btn-dark" style={{ height: 46, fontSize: 15, alignSelf: "flex-start" }} onClick={() => setForm(k)}>{button}</button>
          : unavailable ? <span className="hint">{unavailable}</span> : null}
      </div>
    );
  };

  return (
    <div className="vw" id="viewings">
      {card("video", "Free video walkaround.",
        <>Your Tyrebiter consultant (or the seller) video-calls you at the vehicle and shows you whatever you ask: start it up, look underneath, run the lights, open everything. Free, about 15 minutes.</>,
        "Book a video walkaround", true)}
      {card("in_person", "View it in person, by appointment.",
        <>At the vehicle&apos;s location near {suburb}, {state}, strictly by appointment, with the seller or your consultant there. For verified buyers: bring photo ID. Viewing only, no test drives.</>,
        "Ask for a viewing", inPerson,
        inPerson ? undefined : "The seller hasn't offered in-person viewings for this vehicle. Book a video walkaround or a mechanical inspection instead.")}
      {mine.filter((m) => !["requested", "confirmed"].includes(m.status)).slice(0, 3).map((m) => (
        <span key={m.id} className="hint">{KIND_LABEL[m.kind]} {m.ref}: {STATUS_LABEL[m.status] || m.status}{m.status === "declined" && m.staff_note ? `. ${m.staff_note}` : ""}</span>
      ))}
      {form && <BookForm kind={form} lotId={lotId} title={title} endsAt={endsAt} auction={auction} onClose={() => setForm(null)} onDone={() => { setForm(null); void load(); }} />}
    </div>
  );
}

function Booked({ v, onCancel }: { v: Viewing; onCancel: () => void }) {
  return (
    <div className="vw-booked" data-testid="viewing-booked">
      {v.status === "confirmed" && v.starts_at
        ? <span><b>Booked: {whenLabel(v.starts_at)}</b> (Brisbane time). {v.kind === "video" ? "We'll video-call your verified mobile." : "The address is in the text and email we sent you."}</span>
        : <span><b>Asked for</b> {v.slots.map(slotLabel).join(" · ")}. We&apos;ll text you to confirm a time.</span>}
      <span className="muted" style={{ fontSize: 13 }}>Reference {v.ref} · <button className="linkbtn" style={{ fontSize: 13 }} onClick={onCancel}>Cancel</button></span>
    </div>
  );
}

function BookForm({ kind, lotId, title, endsAt, auction, onClose, onDone }: { kind: ViewingKind; lotId: number; title: string; endsAt: string | null; auction: boolean; onClose: () => void; onDone: () => void }) {
  const v = useViewer();
  const [picked, setPicked] = useState<Slot[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ref, setRef] = useState<string | null>(null);
  const days = viewingDays(endsAt, auction);
  const here = typeof window !== "undefined" ? window.location.pathname + "#viewings" : "/";
  const need = !v.user ? "signin" : v.missing.includes(2) || v.missing.includes(3) ? "mobile" : kind === "in_person" && v.missing.some((n) => n !== 4) ? "verify" : null;
  const heading = kind === "video" ? "Book a video walkaround." : "Ask for a viewing.";
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
    setBusy(true); setErr("");
    const res = await fetch("/api/viewings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, kind, slots: picked, note }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(data.error || "Couldn't send that. Please try again.");
    setRef(data.ref);
  }

  if (need) {
    return (
      <Modal title={heading} onClose={onClose}>
        <p style={{ fontSize: 17, lineHeight: 1.5, margin: 0 }}>
          {need === "signin" ? "Sign in or join first, so we can confirm the time with you."
            : need === "mobile" ? "Add your details and verify your mobile first, so we can call you about the time."
            : "In-person viewings are for verified buyers. Finish setting up your account (your details, mobile and ID): it's the same check as bidding."}
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
        <p style={{ fontSize: 17, lineHeight: 1.5, margin: 0 }}>We&apos;ll text you to confirm {kind === "video" ? "a time for your video walkaround" : "a viewing time"} of the {title}, usually within one business day. Your reference is <b>{ref}</b>.</p>
        {kind === "in_person" && <p className="hint" style={{ margin: 0 }}>The address comes with the confirmation. Bring photo ID. Viewing only, no test drives.</p>}
        <button className="btn btn-blue" onClick={onDone}>Done</button>
      </Modal>
    );
  }
  return (
    <Modal title={heading} onClose={onClose}>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="viewing-form">
        <span className="muted" style={{ fontSize: 15 }}>Pick up to three times that suit you. We&apos;ll confirm one by text and email.{auction ? " Times run until bidding closes." : ""}</span>
        {days.length === 0 ? <div className="notice bad">Bidding closes too soon to book. Call us and we&apos;ll try to fit you in.</div> : (
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
        <span className="hint" style={{ margin: 0 }}>{PARTS.map(([, l, h]) => `${l} ${h}`).join(" · ")}. {picked.length ? `${picked.length} of ${MAX_SLOTS} picked.` : ""}</span>
        <label className="field"><span>{kind === "video" ? "Anything you'd like us to show you? (optional)" : "Anything we should know? (optional)"}</span>
          <textarea className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === "video" ? "Underneath, the tray, a cold start…" : ""} /></label>
        {err && <div className="notice bad" role="alert">{err}</div>}
        <button className="btn btn-blue" disabled={busy || !days.length}>{busy ? "Sending…" : kind === "video" ? "Book the walkaround" : "Ask for the viewing"}</button>
      </form>
    </Modal>
  );
}
