"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const CHECKS: [string, string][] = [
  ["identity", "Year, make, model and variant match the papers and the photos"],
  ["odometer", "Odometer matches the dash photo"],
  ["vin", "VIN matches the VIN plate photo and the PPSR certificate"],
  ["drivetrain", "Transmission, fuel and drive match the photos"],
  ["features", "Every feature mentioned is visible or documented"],
  ["damage", "All damage in the photos is listed, and the grade is fair"],
  ["declarations", "Seller's answers are shown and consistent with the photos"],
  ["photos", "Photos are of this vehicle (no stock or reused photos)"],
  ["price", "The all-in price is shown with every price"],
];

export function AuditForm({ lotId }: { lotId: number }) {
  const router = useRouter();
  const [c, setC] = useState<Record<string, boolean>>(Object.fromEntries(CHECKS.map(([k]) => [k, false])));
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  async function save(allOk: boolean) {
    const checks = allOk ? Object.fromEntries(CHECKS.map(([k]) => [k, true])) : c;
    if (!allOk && Object.values(checks).every(Boolean)) return setMsg("Untick what's wrong, or use All correct.");
    if (!allOk && !note.trim()) return setMsg("Say what's wrong, then fix it in the editor.");
    const res = await fetch("/api/admin/audit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, checks, note }) });
    setMsg(res.ok ? "Recorded." : "Couldn't save that.");
    if (res.ok) router.refresh();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
      {CHECKS.map(([k, label]) => <label key={k} style={{ display: "flex", gap: 8, fontSize: 14 }}><input type="checkbox" checked={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.checked })} /> {label}</label>)}
      <input className="input" style={{ height: 40, fontSize: 14 }} placeholder="Note (what's wrong, what you fixed)" value={note} onChange={(e) => setNote(e.target.value)} />
      <span className="pill-row" style={{ alignItems: "center" }}>
        <button className="btn btn-blue" style={{ height: 38, fontSize: 13 }} onClick={() => save(true)}>All correct</button>
        <button className="btn btn-soft" style={{ height: 38, fontSize: 13, color: "#B4123E" }} onClick={() => save(false)}>Record a problem</button>
        {msg && <span className="hint">{msg}</span>}
      </span>
    </div>
  );
}
