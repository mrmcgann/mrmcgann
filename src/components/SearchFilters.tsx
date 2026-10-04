"use client";
import { CATEGORIES, CAT, FUELS, TRANS, DRIVES, LICENCES, STATE_NAMES, makesFor, modelsFor } from "@/lib/vehicles";
import { ENDINGS, type Facets, type SearchFilters } from "@/lib/search";
import { GRADES } from "@/lib/grades";

const YEARS = Array.from({ length: 45 }, (_, i) => new Date().getFullYear() + 1 - i);
const PRICES = [1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000, 150000, 250000];
const KMS = [10000, 30000, 50000, 75000, 100000, 150000, 200000, 300000, 500000];
const HOURS = [100, 250, 500, 1000, 2000, 5000, 10000];
const CCS = [50, 125, 250, 300, 400, 500, 650, 750, 900, 1000, 1200, 1800];
const LENGTHS = [3, 4, 5, 6, 7, 8, 10, 12, 15];
const n = (v?: number) => (v == null ? "" : ` (${v.toLocaleString("en-AU")})`);
const $ = (v: number) => "$" + v.toLocaleString("en-AU");

/** Every filter, Trade Me Motors-style, with live counts beside the options. */
export function SearchFilterPanel({ f, facets, set }: { f: SearchFilters; facets: Facets | null; set: (patch: SearchFilters) => void }) {
  const cat = f.cat && f.cat !== "cheap" ? CAT[f.cat] : null;
  const extras = cat ? cat.extras : [];
  const usage = cat ? cat.usage : "km";
  // makes: the ones with vehicles live first, then the rest of the catalogue
  const liveMakes = Object.entries(facets?.makes || {}).sort((a, b) => b[1] - a[1]).map(([m]) => m);
  const allMakes = [...liveMakes, ...makesFor(f.cat).filter((m) => !liveMakes.includes(m)).sort()];
  if (f.make && !allMakes.includes(f.make)) allMakes.unshift(f.make);
  const liveModels = Object.entries(facets?.models || {}).filter(([k]) => f.make && k.toLowerCase().startsWith(f.make.toLowerCase() + "|")).sort((a, b) => b[1] - a[1]).map(([k, c]) => [k.split("|")[1], c] as [string, number]);
  const models = [...liveModels.map(([m]) => m), ...modelsFor(f.make, f.cat).filter((m) => !liveModels.some(([x]) => x.toLowerCase() === m.toLowerCase()))];
  if (f.model && !models.some((m) => m.toLowerCase() === f.model!.toLowerCase())) models.unshift(f.model);
  const modelCount = (m: string) => facets?.models?.[`${f.make}|${m}`];
  const sel = (key: keyof SearchFilters, label: string, opts: [string, string][], any = "Any") => (
    <select className="input" aria-label={label} value={f[key] || ""} onChange={(e) => set({ [key]: e.target.value })}>
      <option value="">{any}</option>{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  const chips = (key: keyof SearchFilters, opts: [string, string][], counts?: Record<string, number>) => (
    <div className="chipset">
      <button type="button" className={!f[key] ? "on" : ""} onClick={() => set({ [key]: "" })}>Any</button>
      {opts.map(([v, l]) => <button type="button" key={v} className={f[key] === v ? "on" : ""} aria-pressed={f[key] === v} onClick={() => set({ [key]: f[key] === v ? "" : v })}>{l}{counts && <small>{(counts[v] || 0).toLocaleString("en-AU")}</small>}</button>)}
    </div>
  );
  return (
    <div className="filters">
      <div className="fgrp"><b>Category</b>
        <select className="input" aria-label="Category" value={f.cat || ""} onChange={(e) => set({ cat: e.target.value, type: "", lams: "", lic: "", berths: "", ccmin: "", ccmax: "", lenmin: "", lenmax: "", hrs: "", km: "" })}>
          <option value="">All vehicles{n(facets?.total != null && !f.cat ? facets.total : undefined)}</option>
          {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}{n(facets?.cats?.[c.key])}</option>)}
          <option value="cheap">Under $5,000{n(facets?.cheap)}</option>
        </select>
        {cat && sel("type", "Type", cat.kinds.map(([k, l]) => [k, l + n(facets?.types?.[k])] as [string, string]), `Any ${cat.one} type`)}
      </div>
      <div className="fgrp"><b>Make &amp; model</b>
        <select className="input" aria-label="Make" value={f.make || ""} onChange={(e) => set({ make: e.target.value, model: "" })}>
          <option value="">Any make</option>{allMakes.map((m) => <option key={m} value={m}>{m}{n(facets?.makes?.[m] ?? (facets ? 0 : undefined))}</option>)}
        </select>
        {f.make && <select className="input" aria-label="Model" value={f.model || ""} onChange={(e) => set({ model: e.target.value })}>
          <option value="">Any model</option>{models.map((m) => <option key={m} value={m}>{m}{n(modelCount(m) ?? (facets ? 0 : undefined))}</option>)}
        </select>}
      </div>
      <div className="fgrp"><b>Price</b>
        <div className="two">{sel("min", "Minimum price", PRICES.map((p) => [String(p), $(p)]), "No min")}{sel("max", "Maximum price", PRICES.map((p) => [String(p), $(p)]), "No max")}</div>
      </div>
      <div className="fgrp"><b>Year</b>
        <div className="two">{sel("ymin", "Year from", YEARS.map((y) => [String(y), String(y)]), "From")}{sel("ymax", "Year to", YEARS.map((y) => [String(y), String(y)]), "To")}</div>
      </div>
      {usage === "km" && <div className="fgrp"><b>Kilometres</b>{sel("km", "Maximum kilometres", KMS.map((k) => [String(k), `Under ${k.toLocaleString("en-AU")} km`]), "Any kilometres")}</div>}
      {(usage === "hours" || extras.includes("hours")) && <div className="fgrp"><b>Engine hours</b>{sel("hrs", "Maximum engine hours", HOURS.map((h) => [String(h), `Under ${h.toLocaleString("en-AU")} hrs`]), "Any hours")}</div>}
      {extras.includes("cc") && <div className="fgrp"><b>Engine size</b>
        <div className="two">{sel("ccmin", "Engine size from", CCS.map((c) => [String(c), `${c} cc`]), "From")}{sel("ccmax", "Engine size to", CCS.map((c) => [String(c), `${c} cc`]), "To")}</div>
        <label className="checkrow"><input type="checkbox" checked={f.lams === "1"} onChange={(e) => set({ lams: e.target.checked ? "1" : "" })} />LAMS approved (learners)</label>
      </div>}
      {extras.includes("lic") && <div className="fgrp"><b>Licence you hold</b>{sel("lic", "Licence", LICENCES, "Any licence")}<span className="hint">Shows vehicles you can drive on that licence.</span></div>}
      {extras.includes("berths") && <div className="fgrp"><b>Sleeps</b>{sel("berths", "Sleeps at least", [1, 2, 3, 4, 5, 6, 8].map((b) => [String(b), `${b}+`]), "Any")}</div>}
      {extras.includes("length") && <div className="fgrp"><b>Length</b>
        <div className="two">{sel("lenmin", "Length from", LENGTHS.map((l) => [String(l), `${l} m`]), "From")}{sel("lenmax", "Length to", LENGTHS.map((l) => [String(l), `${l} m`]), "To")}</div></div>}
      {usage !== "none" && <div className="fgrp"><b>Transmission</b>{chips("trans", TRANS, facets?.trans)}</div>}
      {f.cat !== "trailers" && f.cat !== "caravans" && <div className="fgrp"><b>Fuel</b>{chips("fuel", FUELS, facets?.fuels)}</div>}
      {(!cat || extras.includes("drive")) && <div className="fgrp"><b>Drive</b>{chips("drive", DRIVES, facets?.drives)}</div>}
      <div className="fgrp"><b>Location</b>
        <select className="input" aria-label="State" value={f.state || ""} onChange={(e) => set({ state: e.target.value })}>
          <option value="">All of Australia</option>{Object.entries(STATE_NAMES).map(([k, l]) => <option key={k} value={k}>{l}{n(facets?.states?.[k] ?? (facets ? 0 : undefined))}</option>)}
        </select>
      </div>
      <div className="fgrp"><b>Seller</b>{chips("seller", [["private", "Private"], ["business", "Business (GST)"]])}</div>
      <div className="fgrp"><b>Registration</b>{chips("rego", [["registered", "Registered"], ["unregistered", "Unregistered"]])}</div>
      <div className="fgrp"><b>Visual grade</b>{sel("grade", "Minimum visual grade", GRADES.slice(0, 4).map(([g, l]) => [g, g === "A" ? "A · Excellent" : `${g} · ${l} or better`]), "Any grade")}</div>
      <div className="fgrp"><b>Auction</b>
        <label className="checkrow"><input type="checkbox" checked={f.nores === "1"} onChange={(e) => set({ nores: e.target.checked ? "1" : "" })} />No reserve, or reserve met</label>
        <label className="checkrow"><input type="checkbox" checked={f.buynow === "1"} onChange={(e) => set({ buynow: e.target.checked ? "1" : "" })} />Buy Now available</label>
        {sel("ending", "Ending", ENDINGS, "Ending any time")}
      </div>
    </div>
  );
}
