"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, CAT, STATE_NAMES, makesFor, modelsFor } from "@/lib/vehicles";
import { searchHref, toQueryString, type Facets, type SearchFilters } from "@/lib/search";

const PRICES = [2000, 5000, 10000, 15000, 20000, 30000, 50000, 75000, 100000];
const TABS = ["cars", "utes", "trucks", "motorbikes", "caravans", "boats"];

/** Trade Me Motors-style search: pick a category, make, model, price and place. Shows the live count as you go. */
export function MotorsSearch() {
  const router = useRouter();
  const [f, setF] = useState<SearchFilters>({ cat: "cars" });
  const [facets, setFacets] = useState<Facets | null>(null);
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      fetch(`/api/lots/facets?${toQueryString(f)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (live) setFacets(d); }).catch(() => {});
    }, 200);
    return () => { live = false; clearTimeout(t); };
  }, [f]);
  const set = (patch: SearchFilters) => setF((x) => { const n = { ...x, ...patch }; for (const [k, v] of Object.entries(patch)) if (!v) delete n[k as keyof SearchFilters]; return n; });
  const liveMakes = Object.entries(facets?.makes || {}).sort((a, b) => b[1] - a[1]).map(([m]) => m);
  const makes = [...liveMakes, ...makesFor(f.cat).filter((m) => !liveMakes.includes(m)).sort()];
  const models = f.make ? Array.from(new Set([...Object.keys(facets?.models || {}).filter((k) => k.startsWith(`${f.make}|`)).map((k) => k.split("|")[1]), ...modelsFor(f.make, f.cat)])) : [];
  const total = facets?.total;
  const more = CATEGORIES.filter((c) => !TABS.includes(c.key));
  return (
    <form className="motors" onSubmit={(e) => { e.preventDefault(); router.push(searchHref(f)); }}>
      <div className="motors-tabs tabs" role="group" aria-label="Category">
        {TABS.map((k) => <button type="button" key={k} className={f.cat === k ? "on" : ""} aria-pressed={f.cat === k} onClick={() => setF({ cat: k })}>{CAT[k].short}</button>)}
        <select className="input" aria-label="More categories" style={{ width: "auto", height: 42, borderRadius: 21, fontWeight: 700, fontSize: 15 }} value={TABS.includes(f.cat || "") ? "" : f.cat} onChange={(e) => setF({ cat: e.target.value || "cars" })}>
          <option value="">More…</option>{more.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
      </div>
      <div className="fields">
        <label className="field"><span>Make</span><select className="input" value={f.make || ""} onChange={(e) => set({ make: e.target.value, model: "" })}><option value="">Any make</option>{makes.map((m) => <option key={m} value={m}>{m}{facets?.makes?.[m] ? ` (${facets.makes[m]})` : ""}</option>)}</select></label>
        <label className="field"><span>Model</span><select className="input" value={f.model || ""} disabled={!f.make} onChange={(e) => set({ model: e.target.value })}><option value="">Any model</option>{models.map((m) => <option key={m} value={m}>{m}{facets?.models?.[`${f.make}|${m}`] ? ` (${facets.models[`${f.make}|${m}`]})` : ""}</option>)}</select></label>
        <label className="field"><span>Max price</span><select className="input" value={f.max || ""} onChange={(e) => set({ max: e.target.value })}><option value="">Any price</option>{PRICES.map((p) => <option key={p} value={p}>Up to ${p.toLocaleString("en-AU")}</option>)}</select></label>
        <label className="field"><span>Location</span><select className="input" value={f.state || ""} onChange={(e) => set({ state: e.target.value })}><option value="">All of Australia</option>{Object.entries(STATE_NAMES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="field"><span>Keywords</span><input className="input" value={f.q || ""} onChange={(e) => set({ q: e.target.value })} placeholder="e.g. towbar, SR5" /></label>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-blue">{total == null ? "Search" : total === 0 ? "Search (none live yet)" : `Show ${total.toLocaleString("en-AU")} ${total === 1 ? CAT[f.cat || "cars"]?.one || "vehicle" : "listings"}`}</button>
        <span className="hint">Nothing yet? Search anyway and save it. We’ll text you the moment one is listed.</span>
      </div>
    </form>
  );
}
