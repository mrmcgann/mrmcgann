"use client";
import { useState } from "react";

export function HandoverForm({ token, keys, who }: { token: string; keys: number | null; who: string }) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [id, setId] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr("");
    const res = await fetch("/api/handover", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, code: f.get("code"), odometer: f.get("odometer"), keys: f.get("keys"), notes: f.get("notes") }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error); return; }
    setDone(true);
  }
  if (done) return <div className="notice ok">Handover confirmed. You can hand over the keys now. Thank you.</div>;
  return (
    <form onSubmit={submit} className="formcard">
      <label className="field"><span>Release code from {who}</span><input className="input" name="code" inputMode="numeric" maxLength={6} pattern="\d{6}" required style={{ fontSize: 28, letterSpacing: ".2em" }} /></label>
      <div className="row2">
        <label className="field"><span>Odometer now (km)</span><input className="input" name="odometer" inputMode="numeric" required /></label>
        <label className="field"><span>Keys handed over</span><input className="input" name="keys" inputMode="numeric" defaultValue={keys ?? ""} required /></label>
      </div>
      <label className="field"><span>Anything to note? (optional)</span><textarea className="input" name="notes" placeholder="e.g. service books and spare key handed over" /></label>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" checked={id} onChange={(e) => setId(e.target.checked)} style={{ width: 20, height: 20 }} /><span>I&apos;ve checked their photo ID matches {who}.</span></label>
      {err && <div className="notice bad">{err}</div>}
      <button className="btn btn-blue" disabled={busy || !id}>{busy ? "Checking…" : "Confirm handover"}</button>
    </form>
  );
}
