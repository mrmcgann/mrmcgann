"use client";
import { useState } from "react";

/** The depot's handover form.
 *
 *  For an unregistered vehicle this screen is the control, not the paperwork. Letting one be driven onto a road
 *  is an offence we commit as well as the driver -- "use, or permit to be used" -- and the only way out is the
 *  buyer's own unregistered vehicle permit. So the depot has to say how it left, and if the answer is "driven"
 *  they have to write down a permit number they were actually shown. complete_handover refuses without it, which
 *  means the keys cannot be signed over on a shrug. */
export function HandoverForm({ token, keys, who, noPlates, canPermit }: { token: string; keys: number | null; who: string; noPlates?: boolean; canPermit?: boolean }) {
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [id, setId] = useState(false);
  const [leftBy, setLeftBy] = useState("");
  const [permit, setPermit] = useState("");
  const [sighted, setSighted] = useState(false);
  const needPermit = noPlates && leftBy === "permit";
  const blocked = !id || (noPlates && !leftBy) || (needPermit && (permit.trim().length < 4 || !sighted));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr("");
    const res = await fetch("/api/handover", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, code: f.get("code"), odometer: f.get("odometer"), keys: f.get("keys"), notes: f.get("notes"),
        leftBy: noPlates ? leftBy : null, permit: needPermit ? permit : null }),
    });
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

      {noPlates && (
        <fieldset className="choice" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700, marginBottom: 8 }}>How is it leaving? It has no plates.</legend>
          {/* A written-off vehicle can hold no permit, so that option isn't offered at all: an impossible
              choice on the screen is an invitation to tick it. */}
          {[["carrier", "On a car carrier or tow truck"], ["trailer", "On a trailer"],
            ...(canPermit ? [["permit", "Being driven, on an unregistered vehicle permit"]] : [])].map(([k, label]) => (
            <label key={k} className={leftBy === k ? "on" : ""}>
              <input type="radio" name="leftBy" checked={leftBy === k} onChange={() => { setLeftBy(k); setErr(""); }} />
              <span><b>{label}</b></span>
            </label>
          ))}
          {needPermit && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              <label className="field"><span>Permit number (from the permit they show you)</span>
                <input className="input" value={permit} onChange={(e) => { setPermit(e.target.value); setErr(""); }} maxLength={40} autoCapitalize="characters" data-testid="handover-permit" /></label>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <input type="checkbox" checked={sighted} onChange={(e) => setSighted(e.target.checked)} style={{ width: 20, height: 20 }} />
                <span>I&apos;ve seen the permit, it&apos;s in date, and it covers this vehicle.</span>
              </label>
              <span className="hint">No permit, or it&apos;s expired? Don&apos;t hand over the keys. They can come back with one, or take it on a truck.</span>
            </div>
          )}
        </fieldset>
      )}

      <label className="field"><span>Anything to note? (optional)</span><textarea className="input" name="notes" placeholder="e.g. service books and spare key handed over" /></label>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" checked={id} onChange={(e) => setId(e.target.checked)} style={{ width: 20, height: 20 }} /><span>I&apos;ve checked their photo ID matches {who}.</span></label>
      {err && <div className="notice bad">{err}</div>}
      <button className="btn btn-blue" disabled={busy || blocked}>{busy ? "Checking…" : "Confirm handover"}</button>
    </form>
  );
}
