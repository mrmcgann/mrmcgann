"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES, CAT, STATE_NAMES, makesFor, modelsFor } from "@/lib/vehicles";
import { searchHref, toQueryString, type Facets, type SearchFilters } from "@/lib/search";
import { useSellCategories, useSellStates } from "@/components/SiteSettings";

const PRICES = [2000, 5000, 10000, 15000, 20000, 30000, 50000, 75000, 100000];
const BIG_PRICES = [20000, 40000, 60000, 80000, 100000, 150000, 200000, 300000];
const TABS = ["cars", "utes", "trucks", "motorbikes", "caravans", "boats"];

/** Trade Me Motors-style search: pick a category, make, model, price and place. Shows the live count as you go.
 *  Offers only what we sell, where we sell it (settings selling.categories / selling.states): with one category
 *  there are no category tabs, and with one state no place to choose. */
export function MotorsSearch() {
  const router = useRouter();
  const sold = useSellCategories(), states = useSellStates();
  const only = sold.length === 1 ? sold[0] : null;
  const tabs = only ? [] : TABS.filter((k) => sold.includes(k as never));
  const first = only || tabs[0] || sold[0] || "cars";
  const [f, setF] = useState<SearchFilters>({ cat: first });
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
  const more = CATEGORIES.filter((c) => sold.includes(c.key) && !tabs.includes(c.key));
  const prices = only === "trucks" || only === "machinery" || only === "buses" ? BIG_PRICES : PRICES;
  const cat = CAT[f.cat || first];
  return (
    <form className="motors" onSubmit={(e) => { e.preventDefault(); router.push(searchHref(f)); }}>
      {only ? null : <div className="motors-tabs tabs" role="group" aria-label="Category">
        {tabs.map((k) => <button type="button" key={k} className={f.cat === k ? "on" : ""} aria-pressed={f.cat === k} onClick={() => setF({ cat: k })}>{CAT[k].short}</button>)}
        {more.length > 0 && <select className="input" aria-label="More categories" style={{ width: "auto", height: 42, borderRadius: 21, fontWeight: 700, fontSize: 15 }} value={tabs.includes(f.cat || "") ? "" : f.cat} onChange={(e) => setF({ cat: e.target.value || first })}>
          <option value="">More…</option>{more.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>}
      </div>}
      <div className="fields">
        {only && cat && <label className="field"><span>Type</span><select className="input" value={f.type || ""} onChange={(e) => set({ type: e.target.value })}><option value="">Any {cat.one} type</option>{cat.kinds.map(([k, l]) => <option key={k} value={k}>{l}{facets?.types?.[k] ? ` (${facets.types[k]})` : ""}</option>)}</select></label>}
        <label className="field"><span>Make</span><select className="input" value={f.make || ""} onChange={(e) => set({ make: e.target.value, model: "" })}><option value="">Any make</option>{makes.map((m) => <option key={m} value={m}>{m}{facets?.makes?.[m] ? ` (${facets.makes[m]})` : ""}</option>)}</select></label>
        <label className="field"><span>Model</span><select className="input" value={f.model || ""} disabled={!f.make} onChange={(e) => set({ model: e.target.value })}><option value="">Any model</option>{models.map((m) => <option key={m} value={m}>{m}{facets?.models?.[`${f.make}|${m}`] ? ` (${facets.models[`${f.make}|${m}`]})` : ""}</option>)}</select></label>
        <label className="field"><span>Max price</span><select className="input" value={f.max || ""} onChange={(e) => set({ max: e.target.value })}><option value="">Any price</option>{prices.map((p) => <option key={p} value={p}>Up to ${p.toLocaleString("en-AU")}</option>)}</select></label>
        {states.length > 1 && <label className="field"><span>Location</span><select className="input" value={f.state || ""} onChange={(e) => set({ state: e.target.value })}><option value="">Anywhere we sell</option>{states.map((k) => <option key={k} value={k}>{STATE_NAMES[k] || k}</option>)}</select></label>}
        <label className="field"><span>Keywords</span><input className="input" value={f.q || ""} onChange={(e) => set({ q: e.target.value })} placeholder={only === "trucks" ? "e.g. sleeper cab, PTO, air suspension" : "e.g. towbar, SR5"} /></label>
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn btn-blue">{total == null ? "Search" : total === 0 ? "Search (none live yet)" : `Show ${total.toLocaleString("en-AU")} ${total === 1 ? cat?.one || "vehicle" : "listings"}`}</button>
        <span className="hint">Nothing yet? Search anyway and save it. We’ll text you the moment one is listed.</span>
      </div>
    </form>
  );
}
