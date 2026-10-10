"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Fees, Lot } from "@/lib/types";
import { LotCard } from "@/components/LotCard";
import { SaveSearchButton } from "@/components/SaveSearchButton";
import { SearchBar } from "@/components/SearchBar";
import { SearchFilterPanel } from "@/components/SearchFilters";
import { CATEGORIES, CAT } from "@/lib/vehicles";
import { SORTS, describeParts, filtersFromParams, heading, toQueryString, type Facets, type FilterKey, type SearchFilters } from "@/lib/search";
import { track } from "@/components/Tracker";

type Data = { lots: Lot[]; hasMore: boolean; page: number; facets: Facets | null; fees?: Fees };

// Keys that belong to one category: cleared when the category changes.
const CAT_KEYS: FilterKey[] = ["type", "lams", "lic", "berths", "ccmin", "ccmax", "lenmin", "lenmax", "hrs"];
const CHIP_REMOVES: Partial<Record<FilterKey, FilterKey[]>> = { make: ["make", "model"], cat: ["cat", ...CAT_KEYS], ymin: ["ymin", "ymax"], min: ["min", "max"], ccmin: ["ccmin", "ccmax"], lenmin: ["lenmin", "lenmax"] };

// The listing page renders in the browser from an edge-cached search API,
// so the page itself is static and costs nothing to serve.
export function AuctionsClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const f = useMemo(() => filtersFromParams(new URLSearchParams(sp.toString())), [sp]);
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const key = toQueryString(f, { page: page > 1 ? String(page) : "" });
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState(false);
  const [drawer, setDrawer] = useState(false);

  // Plain-English links (?q=hilux+under+30k) become proper filters in the address bar.
  useEffect(() => { if (key !== sp.toString()) router.replace(`/auctions${key ? `?${key}` : ""}`, { scroll: false }); }, [key, sp, router]);
  useEffect(() => {
    let live = true;
    setErr(false);
    fetch(`/api/lots/search?${key}`).then((r) => r.json()).then((d) => { if (live) setData(d); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [key]);

  const href = (next: SearchFilters, p = 1) => { const s = toQueryString(next, { page: p > 1 ? String(p) : "" }); return `/auctions${s ? `?${s}` : ""}`; };
  const set = (patch: SearchFilters) => {
    const next: SearchFilters = { ...f, ...patch };
    for (const [k, v] of Object.entries(patch)) if (!v) delete next[k as FilterKey];
    router.replace(href(next), { scroll: false });
  };
  const remove = (k: FilterKey) => { const patch: SearchFilters = {}; for (const x of CHIP_REMOVES[k] || [k]) patch[x] = ""; set(patch); };

  // one chip per active filter, each removable
  const chips: [FilterKey, string][] = [];
  const parts = describeParts(f);
  const order: FilterKey[] = ["make", "cat", "ymin", "min", "km", "hrs", "ccmin", "lams", "lic", "berths", "lenmin", "fuel", "trans", "drive", "state", "seller", "nores", "buynow", "ending", "grade", "q"];
  const single = (k: FilterKey) => describeParts({ [k]: f[k], ...(k === "ymin" ? { ymax: f.ymax } : {}), ...(k === "min" ? { max: f.max } : {}), ...(k === "make" ? { model: f.model } : {}), ...(k === "cat" ? { type: f.type } : {}), ...(k === "ccmin" ? { ccmax: f.ccmax } : {}), ...(k === "lenmin" ? { lenmax: f.lenmax } : {}) }).join("");
  for (const k of order) {
    const pair = k === "ymin" ? f.ymin || f.ymax : k === "min" ? f.min || f.max : k === "ccmin" ? f.ccmin || f.ccmax : k === "lenmin" ? f.lenmin || f.lenmax : f[k];
    if (pair && !(k === "cat" && f.make && f.model && !f.type)) chips.push([k === "ymin" && !f.ymin ? "ymax" : k === "min" && !f.min ? "max" : k, single(k)]);
  }
  const facets = data?.facets || null;
  const total = facets?.total;
  // What was searched and how many vehicles matched (zero results = demand we can't meet yet).
  // Waits until the filters settle, so dragging a slider is one search, not twenty.
  const described = describeParts({ ...f, q: undefined }).join(" "); // the filters only, never the typed words
  useEffect(() => {
    if (!described || total == null || page > 1) return;
    const t = setTimeout(() => track("search", { q: described, n: total }), 1500);
    return () => clearTimeout(t);
  }, [described, total, page]);
  const filtersOn = chips.length > 0;

  return (
    <div className="wrap">
      <div className="srch-head">
        <h1 className="d3">{heading(f)}</h1>
        <SearchBar initial={f.q || ""} />
        <nav className="srch-cats" aria-label="Categories">
          <Link href={href({ ...f, cat: undefined, type: undefined })} className={!f.cat ? "on" : ""}>All {facets?.cats && <small>{Object.values(facets.cats).reduce((a, b) => a + b, 0).toLocaleString("en-AU")}</small>}</Link>
          {CATEGORIES.map((c) => (
            <Link key={c.key} href={href({ ...Object.fromEntries(Object.entries(f).filter(([k]) => !CAT_KEYS.includes(k as FilterKey))), cat: c.key })} className={f.cat === c.key ? "on" : ""}>
              {c.short} {facets?.cats && <small>{(facets.cats[c.key] || 0).toLocaleString("en-AU")}</small>}
            </Link>
          ))}
          <Link href={href({ ...f, cat: "cheap", type: undefined })} className={f.cat === "cheap" ? "on" : ""}>Under $5k {facets?.cheap != null && <small>{facets.cheap.toLocaleString("en-AU")}</small>}</Link>
        </nav>
      </div>

      <div className="srch-grid">
        <SearchFilterPanel f={f} facets={facets} set={set} />
        <div style={{ minWidth: 0 }}>
          <div className="srch-bar">
            <span className="count" aria-live="polite">{total == null ? "Searching…" : `${total.toLocaleString("en-AU")} ${total === 1 ? "vehicle" : "vehicles"}`}</span>
            {chips.map(([k, label]) => <button key={k} type="button" className="active-chip" onClick={() => remove(k)} aria-label={`Remove ${label}`}>{label}<span aria-hidden="true">×</span></button>)}
            {filtersOn && <button type="button" className="linkbtn" onClick={() => router.replace("/auctions", { scroll: false })}>Clear all</button>}
            <div className="srch-sort">
              <button type="button" className="pill pill-dark filters-btn" style={{ height: 42 }} onClick={() => setDrawer(true)}>Filters{chips.length ? ` (${chips.length})` : ""}</button>
              <select aria-label="Sort" value={f.sort || "ending"} onChange={(e) => set({ sort: e.target.value === "ending" ? "" : e.target.value })}>
                {SORTS.map(([v, l]) => <option key={v} value={v}>{f.view === "closed" && v === "ending" ? "Most recently closed" : l}</option>)}
              </select>
            </div>
          </div>
          <div className="pill-row" style={{ marginBottom: 22 }}>
            <Link className={`pill ${!f.view ? "pill-dark" : "pill-soft"}`} href={href({ ...f, view: undefined })}>Live</Link>
            <Link className={`pill ${f.view === "offers" ? "pill-dark" : "pill-soft"}`} href={href({ ...f, view: "offers" })}>Make an offer</Link>
            <Link className={`pill ${f.view === "closed" ? "pill-dark" : "pill-soft"}`} href={href({ ...f, view: "closed" })}>Recently closed</Link>
            {filtersOn && <SaveSearchButton query={f} label={parts.join(" · ")} />}
          </div>
          {err && <div className="notice bad">We couldn&apos;t load vehicles just now. <Link href={href(f, page)}>Try again</Link>.</div>}
          <div className="grid" aria-busy={!data}>
            {!data && !err && Array.from({ length: 8 }, (_, i) => <div key={i} className="card" style={{ minHeight: 360, background: "var(--panel)", borderRadius: 32 }} />)}
            {data && (data.lots.length ? data.lots.map((l) => <LotCard key={l.id} lot={l} cover={l.cover_path} fees={data.fees} />) : (
              <div className="empty">
                <b style={{ fontSize: 22 }}>{f.cat && CAT[f.cat] ? `No ${CAT[f.cat].label.toLowerCase()} match that yet.` : "Nothing matches that yet."}</b>
                <span className="muted">Remove a filter, or save this search and we&apos;ll text or email you when one is listed.</span>
                <div className="pill-row" style={{ justifyContent: "center" }}>
                  {chips.slice(0, 4).map(([k, label]) => <button key={k} type="button" className="pill" style={{ background: "#FFFFFF" }} onClick={() => remove(k)}>Remove {label} ×</button>)}
                  {filtersOn && <SaveSearchButton query={f} label={parts.join(" · ")} />}
                </div>
              </div>
            ))}
          </div>
          {data && (page > 1 || data.hasMore) && (
            <nav className="pill-row" aria-label="Pages" style={{ justifyContent: "center", marginTop: 40 }}>
              {page > 1 && <Link className="btn btn-soft" href={href(f, page - 1)}>‹ Previous</Link>}
              <span className="muted" style={{ alignSelf: "center" }}>Page {page}</span>
              {data.hasMore && <Link className="btn btn-soft" href={href(f, page + 1)}>Next ›</Link>}
            </nav>
          )}
        </div>
      </div>

      {drawer && (
        <div className="drawer" onClick={(e) => { if (e.target === e.currentTarget) setDrawer(false); }}>
          <div className="in" role="dialog" aria-label="Filters">
            <div className="hd"><b style={{ fontSize: 20 }}>Filters</b><button className="pill pill-soft" onClick={() => setDrawer(false)}>Close</button></div>
            <div className="bd"><SearchFilterPanel f={f} facets={facets} set={set} /></div>
            <div className="ft">
              {filtersOn && <button className="btn btn-soft" style={{ flex: 1 }} onClick={() => router.replace("/auctions", { scroll: false })}>Clear all</button>}
              <button className="btn btn-blue" style={{ flex: 2 }} onClick={() => setDrawer(false)}>{total == null ? "Show vehicles" : `Show ${total.toLocaleString("en-AU")} ${total === 1 ? "vehicle" : "vehicles"}`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
