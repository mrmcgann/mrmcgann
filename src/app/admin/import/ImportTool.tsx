"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { parseCsv } from "@/lib/csv";
import { importTemplate, rowsToLots } from "@/lib/importLots";

export function ImportTool({ sales }: { sales: { id: number; title: string }[] }) {
  const [csv, setCsv] = useState("");
  const [saleId, setSaleId] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [business, setBusiness] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; first?: number } | null>(null);
  const rows = useMemo(() => (csv.trim() ? rowsToLots(parseCsv(csv)) : []), [csv]);
  const good = rows.filter((r) => !r.problems.length).length;
  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(importTemplate())}`;

  async function run() {
    setBusy(true); setMsg(null);
    const res = await fetch("/api/admin/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ csv, saleId: saleId || null, sellerName, business }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: `Added ${d.added} draft${d.added === 1 ? "" : "s"}${d.skipped ? `; skipped ${d.skipped} with problems` : ""}.`, first: d.first } : { ok: false, text: d.error || "Couldn't import." });
    if (res.ok) setCsv("");
  }
  return (
    <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <span className="hint"><a className="blue" href={template} download="tyrebiter-bulk-upload.csv">Download the template ›</a> One vehicle per row, up to 500. Make and model are required; anything else can be filled in later.</span>
      <label className="drop"><b>Choose a CSV file</b><span className="hint">Or paste it below.</span><input type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(setCsv); }} data-testid="import-file" /></label>
      <textarea className="input" style={{ minHeight: 140, fontFamily: "monospace", fontSize: 13 }} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="Year,Make,Model,…" aria-label="CSV" data-testid="import-csv" />
      <div className="grid3">
        <label className="field"><span>Add to a sale (optional)</span><select className="input" value={saleId} onChange={(e) => setSaleId(e.target.value)}><option value="">No sale</option>{sales.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
        <label className="field"><span>Seller name (private)</span><input className="input" value={sellerName} onChange={(e) => setSellerName(e.target.value)} placeholder="e.g. Fleet manager's company" /></label>
        <label className="field"><span>Seller</span><select className="input" value={business ? "business" : "private"} onChange={(e) => setBusiness(e.target.value === "business")}><option value="business">Business seller</option><option value="private">Private seller</option></select></label>
      </div>
      {rows.length > 0 && (
        <>
          <b>{rows.length} row{rows.length === 1 ? "" : "s"}: {good} ready{rows.length - good ? `, ${rows.length - good} with problems (skipped)` : ""}.</b>
          <div style={{ overflowX: "auto" }}>
            <table className="table" data-testid="import-preview"><thead><tr><th>Title</th><th>Category</th><th>VIN</th><th>Rego</th><th>Location</th><th>Problems</th></tr></thead>
              <tbody>{rows.slice(0, 200).map((r, i) => <tr key={i} style={{ background: r.problems.length ? "#FDECEF" : undefined }}><td>{String(r.lot.title)}</td><td>{String(r.lot.category)}</td><td>{String(r.lot.vin || "")}</td><td>{String(r.lot.rego_plate || r.lot.registration || "")}</td><td>{[r.lot.suburb, r.lot.state].filter(Boolean).join(", ")}</td><td>{r.problems.join("; ")}</td></tr>)}</tbody></table>
          </div>
        </>
      )}
      {msg && <div className={`notice ${msg.ok ? "ok" : "bad"}`}>{msg.text} {msg.first && <Link className="blue" href={saleId ? `/admin/lots?sale=${saleId}` : "/admin/lots?status=draft"}>See the drafts ›</Link>}</div>}
      <button className="btn btn-blue" style={{ alignSelf: "flex-start" }} disabled={busy || !good} onClick={run} data-testid="import-run">{busy ? "Adding…" : `Add ${good || ""} draft${good === 1 ? "" : "s"}`}</button>
    </div>
  );
}
