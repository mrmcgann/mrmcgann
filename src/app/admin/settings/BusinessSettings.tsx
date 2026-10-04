"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const STATES = ["QLD", "NSW", "VIC", "WA", "SA", "TAS", "ACT", "NT"];

// Licence numbers shown in the footer of every page and in the Terms. NSW requires the dealer
// licence number in every advertisement (from 1 September 2025); Victoria requires the LMCT number.
export function BusinessSettings({ value }: { value: { licences?: Record<string, string> } }) {
  const router = useRouter();
  const [lic, setLic] = useState<Record<string, string>>(value.licences || {});
  const [msg, setMsg] = useState("");
  async function save() {
    const clean = Object.fromEntries(Object.entries(lic).map(([k, v]) => [k, v.trim().slice(0, 80)]).filter(([, v]) => v));
    const res = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "business", value: { ...value, licences: clean } }) });
    setMsg(res.ok ? "Saved. The footer and Terms now show these." : "Couldn't save.");
    if (res.ok) router.refresh();
  }
  const missing = STATES.filter((s) => !lic[s]?.trim());
  return (
    <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="licence-settings">
      <h2 style={{ fontSize: 22, fontWeight: 800 }}>Licences</h2>
      <p className="hint">The motor dealer or auctioneer licence you hold in each state, as it should appear publicly (for example &quot;Motor dealer licence MD 012345&quot; or &quot;LMCT 12345&quot;). Shown in the footer of every page and in the Terms. Confirm with a lawyer which licence each state needs before you sell there.</p>
      {missing.length > 0 && <div className="notice bad">Not set yet: {missing.join(", ")}. Don&apos;t sell in a state until its licence is in place.</div>}
      <div className="grid2">{STATES.map((s) => <label key={s} className="field"><span>{s}</span><input className="input" value={lic[s] || ""} onChange={(e) => setLic({ ...lic, [s]: e.target.value })} data-testid={`licence-${s}`} /></label>)}</div>
      <span className="pill-row" style={{ alignItems: "center" }}><button className="btn btn-dark" style={{ height: 44 }} onClick={save}>Save licences</button>{msg && <span className="hint">{msg}</span>}</span>
    </div>
  );
}
