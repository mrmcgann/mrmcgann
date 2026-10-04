"use client";
import { useState } from "react";
import { expiryDate, normalizePlate, normalizeVin, REGO_STATES, vehicleLine, type RegoVehicle } from "@/lib/rego";
import { rulesFor } from "@/lib/transfer";

type Result = { found: boolean; complete: boolean; sources: string[]; vehicle: RegoVehicle | null };

export function RegoCheck() {
  const [plate, setPlate] = useState("");
  const [state, setState] = useState("QLD");
  const [vin, setVin] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const rules = rulesFor(state);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setErr(""); setRes(null);
    const p = normalizePlate(plate), v = normalizeVin(vin);
    if (!p && !v) return setErr("Enter a plate, a VIN, or both.");
    setBusy(true);
    const r = await fetch("/api/rego-lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plate: p, state, vin: v }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r || !r.ok) return setErr(d.error || "Couldn't check that just now.");
    setRes(d as Result);
  }

  const fv = res?.vehicle;
  return (
    <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 760 }}>
      <form onSubmit={check} style={{ display: "flex", flexDirection: "column", gap: 12 }} noValidate>
        <div className="platerow">
          <label className="field"><span>Rego plate</span><input className="input plate" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} placeholder="ABC123" autoComplete="off" spellCheck={false} maxLength={10} data-testid="check-plate" /></label>
          <label className="field"><span>State</span><select className="input" value={state} onChange={(e) => setState(e.target.value)} data-testid="check-state">{REGO_STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
        </div>
        <label className="field"><span>VIN (optional)</span><input className="input vin" value={vin} onChange={(e) => setVin(e.target.value.toUpperCase())} placeholder="17 letters and numbers" autoComplete="off" spellCheck={false} maxLength={20} data-testid="check-vin" /></label>
        <button className="btn btn-dark" style={{ alignSelf: "flex-start", height: 50 }} disabled={busy} data-testid="check-submit">{busy ? "Checking…" : "Check"}</button>
      </form>
      {err && <div className="notice bad" role="alert">{err}</div>}

      {res && (fv ? (
        <div className="found ok" data-testid="check-result">
          <span className="eyebrow" style={{ margin: 0 }}>From {res.sources.map((s) => (s === "vin" ? "the VIN" : s)).join(" and ")}</span>
          <b style={{ fontSize: 22, letterSpacing: "-0.02em" }}>{fv.description}</b>
          {vehicleLine(fv) && <span>{vehicleLine(fv)}</span>}
          <span className="muted" style={{ fontSize: 14 }}>{[fv.vinEnding ? `VIN ending ${fv.vinEnding}` : null, fv.country ? `Built in ${fv.country}` : null, fv.regoExpiry ? `Rego expiry ${expiryDate(fv.regoExpiry)} when we listed it` : null, fv.engine].filter(Boolean).join(" · ")}</span>
          {!res.complete && <span style={{ fontSize: 14 }}>Only part of it is known. Confirm the rest with the papers and the checks below.</span>}
        </div>
      ) : (
        <div className="notice" data-testid="check-result">Nothing on record for that yet. Use the state&apos;s free check and the PPSR below.</div>
      ))}

      <div className="soft" style={{ gap: 10 }}>
        <b>Confirm it with the official checks</b>
        <span className="pill-row">
          <a className="btn btn-blue" style={{ height: 44, fontSize: 14 }} href={rules.checkUrl} target="_blank" rel="noopener noreferrer" data-testid="check-state-link">Free rego check: {rules.authority} ›</a>
          <a className="btn btn-soft" style={{ height: 44, fontSize: 14, background: "#FFFFFF" }} href="https://www.ppsr.gov.au/carcheck" target="_blank" rel="noopener noreferrer">PPSR search (small fee) ›</a>
        </span>
        <span className="hint">The state checks are free for a person to use, one vehicle at a time. Their terms don&apos;t allow automated checking, so the site doesn&apos;t do it for you. {state === "VIC" ? "Victoria's check also takes the VIN." : state === "QLD" ? "Queensland's check also takes the VIN for vehicles built from 1989." : "This state's check is by plate."}</span>
      </div>
    </div>
  );
}
