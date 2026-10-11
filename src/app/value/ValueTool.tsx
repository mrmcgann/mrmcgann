"use client";
import { useState } from "react";
import Link from "next/link";
import { CATEGORIES, makesFor, modelsFor } from "@/lib/vehicles";
import { money } from "@/lib/format";

const YEARS = Array.from({ length: 40 }, (_, i) => new Date().getFullYear() - i);
type Est = { count: number; low?: number; mid?: number; high?: number };

export function ValueTool() {
  const [cat, setCat] = useState("cars");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [r, setR] = useState<Est | null>(null);
  const [busy, setBusy] = useState(false);
  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (!make || !model) return;
    setBusy(true);
    const x = await fetch(`/api/estimate?${new URLSearchParams({ make, model, year })}`).then((y) => y.json()).catch(() => null);
    setBusy(false);
    setR(x || { count: 0 });
  }
  const sell = `/sell?${new URLSearchParams({ make, model, ...(year ? { year } : {}) })}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <form className="soft" onSubmit={check} style={{ gap: 14 }} data-testid="value-form">
        <div className="row2">
          <label className="field"><span>Type</span><select className="input" value={cat} onChange={(e) => { setCat(e.target.value); setMake(""); setModel(""); setR(null); }} style={{ background: "#FFFFFF" }}>{CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select></label>
          <label className="field"><span>Year (optional)</span><select className="input" value={year} onChange={(e) => { setYear(e.target.value); setR(null); }} style={{ background: "#FFFFFF" }}><option value="">Any year</option>{YEARS.map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
        </div>
        <div className="row2">
          <label className="field"><span>Make</span><select className="input" value={make} onChange={(e) => { setMake(e.target.value); setModel(""); setR(null); }} required style={{ background: "#FFFFFF" }} data-testid="value-make"><option value="">Choose a make</option>{makesFor(cat).sort().map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
          <label className="field"><span>Model</span><select className="input" value={model} onChange={(e) => { setModel(e.target.value); setR(null); }} required disabled={!make} style={{ background: "#FFFFFF" }} data-testid="value-model"><option value="">Choose a model</option>{modelsFor(make, cat).map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
        </div>
        <button className="btn btn-blue" style={{ alignSelf: "flex-start", height: 52 }} disabled={busy || !make || !model}>{busy ? "Checking…" : "Check what it's worth"}</button>
      </form>
      {r && (r.count >= 3 && r.mid ? (
        <div className="soft" style={{ gap: 10, background: "var(--mint)" }} data-testid="value-result" role="status">
          <span style={{ fontWeight: 700 }}>{[year, make, model].filter(Boolean).join(" ")}</span>
          <b style={{ fontSize: "clamp(36px,6vw,56px)", letterSpacing: "-0.04em", lineHeight: 1 }}>{money(r.low!)} to {money(r.high!)}</b>
          <span>Most sold for about <b>{money(r.mid)}</b>, from {r.count} sales on Tyrebiter{year ? " within two years of that age" : ""} in the last 18 months. Condition, kilometres and options move the price a lot, so treat it as a guide.</span>
          <div className="pill-row"><Link className="btn btn-dark" href={sell}>Get a free appraisal</Link><Link className="btn btn-soft" style={{ background: "#FFFFFF" }} href={`/auctions?${new URLSearchParams({ make, model })}`}>See them for sale</Link></div>
        </div>
      ) : (
        <div className="soft" style={{ gap: 10 }} data-testid="value-result" role="status">
          <b style={{ fontSize: 20 }}>Not enough sales of the {make} {model} on Tyrebiter yet to give a fair range.</b>
          <span>We only show a range when at least three have sold, so it means something. Ask for a free appraisal instead: we&apos;ll look at yours and tell you what we&apos;d expect it to fetch.</span>
          <Link className="btn btn-dark" style={{ alignSelf: "flex-start" }} href={sell}>Get a free appraisal</Link>
        </div>
      ))}
      <p className="hint">From vehicles sold on Tyrebiter (the winning bid, before fees). Not a formal valuation for insurance, finance or tax.</p>
    </div>
  );
}
