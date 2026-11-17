"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { localToIso, stateTz } from "@/lib/viewings";

// Confirm a viewing time once the owner has agreed it, or say it can't be booked (the member sees the reason).
// Confirming sends the member the address and the owner the member's name (admin_viewing).
export function ViewingConfirm({ id, state }: { id: string; state: string }) {
  // the owner agrees a time on their own clock, so it's entered and sent in the truck's state
  const zone = stateTz(state).replace("Australia/", "");
  const router = useRouter();
  const [when, setWhen] = useState("");
  const [note, setNote] = useState("");
  const [why, setWhy] = useState("");
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function send(body: Record<string, unknown>) {
    setBusy(true); setMsg("");
    const res = await fetch("/api/admin/viewing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(data.error || "Failed"); return; }
    router.refresh();
  }
  return (
    <div className="vw-admin" data-testid={`viewing-actions-${id}`}>
      <label className="field"><span>Time agreed with the owner ({zone} time)</span><input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ height: 40 }} /></label>
      <label className="field" style={{ flex: "1 1 200px" }}><span>Note to the member (optional)</span><input className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} style={{ height: 40 }} placeholder="e.g. Ask for Dave at the office" /></label>
      <span className="pill-row">
        <button className="btn btn-blue" style={{ height: 40, fontSize: 14 }} disabled={busy || !when} onClick={() => { const at = localToIso(when, state); if (!at) { setMsg("Enter the date and time."); return; } void send({ do: "confirm", startsAt: at, note }); }}>Confirm and send the address</button>
        <button className="btn btn-soft" style={{ height: 40, fontSize: 14, color: "#B4123E" }} disabled={busy} onClick={() => setDeclining(!declining)}>Can&apos;t book</button>
      </span>
      {declining && (
        <span className="pill-row" style={{ width: "100%" }}>
          <input className="input" value={why} maxLength={500} onChange={(e) => setWhy(e.target.value)} placeholder="Why (the member sees this)" style={{ height: 40, flex: "1 1 240px" }} />
          <button className="btn btn-dark" style={{ height: 40, fontSize: 14 }} disabled={busy || !why.trim()} onClick={() => send({ do: "decline", note: why })}>Send</button>
        </span>
      )}
      {msg && <span className="errmsg" style={{ fontSize: 13 }}>{msg}</span>}
    </div>
  );
}

// Our mobile mechanic: book the time agreed with the owner and the mechanic (the member is sent the amount to pay and
// the owner the time), or say it can't be booked (the member sees the reason). admin_inspection does the rest.
export function MechanicBook({ id, state }: { id: string; state: string }) {
  const zone = stateTz(state).replace("Australia/", "");
  const router = useRouter();
  const [when, setWhen] = useState("");
  const [who, setWho] = useState("");
  const [why, setWhy] = useState("");
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function send(body: Record<string, unknown>) {
    setBusy(true); setMsg("");
    const res = await fetch("/api/admin/inspection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(data.error || "Failed"); return; }
    router.refresh();
  }
  return (
    <div className="vw-admin" data-testid={`mechanic-book-${id}`}>
      <label className="field"><span>Time agreed with the owner ({zone} time)</span><input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ height: 40 }} /></label>
      <label className="field" style={{ flex: "1 1 200px" }}><span>Mechanic going</span><input className="input" value={who} maxLength={120} onChange={(e) => setWho(e.target.value)} style={{ height: 40 }} placeholder="e.g. Kev Walsh" /></label>
      <span className="pill-row">
        <button className="btn btn-blue" style={{ height: 40, fontSize: 14 }} disabled={busy || !when || who.trim().length < 2}
          onClick={() => { const at = localToIso(when, state); if (!at) { setMsg("Enter the date and time."); return; } void send({ do: "book", startsAt: at, mechanic: who }); }}>Book and send the amount to pay</button>
        <button className="btn btn-soft" style={{ height: 40, fontSize: 14, color: "#B4123E" }} disabled={busy} onClick={() => setDeclining(!declining)}>Can&apos;t book</button>
      </span>
      {declining && (
        <span className="pill-row" style={{ width: "100%" }}>
          <input className="input" value={why} maxLength={500} onChange={(e) => setWhy(e.target.value)} placeholder="Why (the member sees this)" style={{ height: 40, flex: "1 1 240px" }} />
          <button className="btn btn-dark" style={{ height: 40, fontSize: 14 }} disabled={busy || !why.trim()} onClick={() => send({ do: "decline", note: why })}>Send</button>
        </span>
      )}
      {msg && <span className="errmsg" style={{ fontSize: 13 }}>{msg}</span>}
    </div>
  );
}

// Close a paid booking: upload the mechanic's report, write what they found, and confirm the listing's damage and
// wear shows it (the database won't close it without that tick: every bidder must see what our mechanic found).
export function MechanicDone({ id, lotId }: { id: string; lotId: number }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState("");
  const [faults, setFaults] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function close() {
    if (!file) { setMsg("Choose the report (a PDF)."); return; }
    setBusy(true); setMsg("");
    const fd = new FormData(); fd.append("id", id); fd.append("file", file);
    const up = await fetch("/api/admin/mechanic-report", { method: "POST", body: fd });
    const u = await up.json().catch(() => ({}));
    if (!up.ok) { setBusy(false); setMsg(u.error || "Couldn't upload the report."); return; }
    const res = await fetch("/api/admin/inspection", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, do: "done", report: u.path, summary, faults }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg(data.error || "Failed"); return; }
    router.refresh();
  }
  return (
    <div className="vw-admin" style={{ flexDirection: "column", alignItems: "stretch" }} data-testid={`mechanic-done-${id}`}>
      <label className="field"><span>The mechanic&apos;s report (PDF)</span><input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
      <label className="field"><span>What they found, in a line or two (the member and the owner see this)</span>
        <textarea className="input" maxLength={2000} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="e.g. Starts and idles well. Front left brake chamber leaking; steer tyres about 40%." /></label>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14 }}>
        <input type="checkbox" checked={faults} onChange={(e) => setFaults(e.target.checked)} style={{ marginTop: 3 }} />
        <span>Everything that needs attention is on the listing&apos;s damage and wear (or nothing did). <a className="blue" href={`/admin/lots/${lotId}`} target="_blank" rel="noreferrer">Open the listing</a></span>
      </label>
      <span className="pill-row">
        <button className="btn btn-blue" style={{ height: 40, fontSize: 14 }} disabled={busy || !file || summary.trim().length < 20 || !faults} onClick={close}>{busy ? "Closing…" : "Send the report and close it"}</button>
      </span>
      {msg && <span className="errmsg" style={{ fontSize: 13 }}>{msg}</span>}
    </div>
  );
}
