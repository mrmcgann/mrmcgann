"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Lot } from "@/lib/types";
import { LotCard } from "@/components/LotCard";
import { SaveSearchButton } from "@/components/SaveSearchButton";
import { STATES } from "@/lib/grades";

const CATS = [["", "All"], ["cars", "Cars"], ["utes", "Utes"], ["trucks", "Trucks"], ["cheap", "Under $5k"]];
const MAKES = ["Toyota", "Ford", "Mazda", "Hyundai", "Holden", "Mitsubishi", "Nissan", "Kia", "Volkswagen", "Subaru", "Isuzu", "Hino", "Kenworth", "Mercedes-Benz", "BMW", "Honda", "Suzuki", "Jeep", "Land Rover", "Audi"];
const YEARS = Array.from({ length: 30 }, (_, i) => new Date().getFullYear() - i);
type F = Record<string, string>;

// The listing page renders in the browser from an edge-cached search API,
// so the page itself is static and costs nothing to serve.
export function AuctionsClient() {
  const sp = useSearchParams();
  const f: F = Object.fromEntries(Array.from(sp.entries()).filter(([, v]) => v));
  const key = sp.toString();
  const [data, setData] = useState<{ lots: Lot[]; hasMore: boolean; page: number } | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let live = true;
    setErr(false);
    fetch(`/api/lots/search?${key}`).then((r) => r.json()).then((d) => { if (live) setData(d); }).catch(() => { if (live) setErr(true); });
    return () => { live = false; };
  }, [key]);
  const page = Number(f.page) || 1;
  const qs = (patch: F) => {
    const p = new URLSearchParams(Object.entries({ ...f, page: "", ...patch }).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return `/auctions${s ? `?${s}` : ""}`;
  };
  const heading = f.view === "offers" ? "Make an offer." : f.view === "closed" ? "Recently closed." : f.cat === "cheap" ? "Under $5,000." : f.cat ? `${f.cat[0].toUpperCase()}${f.cat.slice(1)}.` : "Live auctions.";
  const labelParts = [f.q && `“${f.q}”`, f.make, f.cat && CATS.find((c) => c[0] === f.cat)?.[1], f.state, f.max && `under $${Number(f.max).toLocaleString("en-AU")}`,
    f.ymin && `from ${f.ymin}`, f.km && `under ${Number(f.km).toLocaleString("en-AU")} km`].filter(Boolean);
  const moreOpen = Boolean(f.make || f.ymin || f.ymax || f.km || f.trans || f.fuel || f.body);

  return (
    <div className="wrap">
      <div className="center" style={{ gap: 22, padding: "clamp(40px,6vw,72px) 0 40px" }}>
        <h1 className="d2">{heading}</h1>
        <form key={key} className="formcard" action="/auctions" style={{ width: "min(980px,100%)", flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", padding: 20, borderRadius: 28 }}>
          <label className="field" style={{ flex: "2 1 240px" }}><span>Search</span><input className="input" name="q" defaultValue={f.q || ""} placeholder="Make, model, suburb or lot number" /></label>
          <label className="field" style={{ flex: "1 1 120px" }}><span>Type</span>
            <select className="input" name="cat" defaultValue={f.cat || ""}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="field" style={{ flex: "1 1 110px" }}><span>State</span>
            <select className="input" name="state" defaultValue={f.state || ""}><option value="">All</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="field" style={{ flex: "1 1 140px" }}><span>Max current bid</span>
            <select className="input" name="max" defaultValue={f.max || ""}><option value="">No limit</option>{[3000, 5000, 10000, 20000, 30000, 50000, 100000].map((n) => <option key={n} value={n}>${n.toLocaleString("en-AU")}</option>)}</select></label>
          <label className="field" style={{ flex: "1 1 150px" }}><span>Sort</span>
            <select className="input" name="sort" defaultValue={f.sort || "ending"}><option value="ending">{f.view === "closed" ? "Most recent" : "Ending soonest"}</option><option value="newest">Newly listed</option><option value="price">Lowest bid</option><option value="price_desc">Highest bid</option></select></label>
          <details style={{ flex: "1 1 100%" }} open={moreOpen}>
            <summary style={{ cursor: "pointer", fontWeight: 700, padding: "6px 0" }}>More filters</summary>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
              <label className="field" style={{ flex: "1 1 150px" }}><span>Make</span><select className="input" name="make" defaultValue={f.make || ""}><option value="">Any</option>{MAKES.map((m) => <option key={m}>{m}</option>)}</select></label>
              <label className="field" style={{ flex: "1 1 110px" }}><span>Year from</span><select className="input" name="ymin" defaultValue={f.ymin || ""}><option value="">Any</option>{YEARS.map((y) => <option key={y}>{y}</option>)}</select></label>
              <label className="field" style={{ flex: "1 1 110px" }}><span>Year to</span><select className="input" name="ymax" defaultValue={f.ymax || ""}><option value="">Any</option>{YEARS.map((y) => <option key={y}>{y}</option>)}</select></label>
              <label className="field" style={{ flex: "1 1 140px" }}><span>Max kilometres</span><select className="input" name="km" defaultValue={f.km || ""}><option value="">Any</option>{[50000, 100000, 150000, 200000, 300000, 500000].map((n) => <option key={n} value={n}>{n.toLocaleString("en-AU")} km</option>)}</select></label>
              <label className="field" style={{ flex: "1 1 130px" }}><span>Transmission</span><select className="input" name="trans" defaultValue={f.trans || ""}><option value="">Any</option><option>Auto</option><option>Manual</option></select></label>
              <label className="field" style={{ flex: "1 1 130px" }}><span>Fuel</span><select className="input" name="fuel" defaultValue={f.fuel || ""}><option value="">Any</option><option>Petrol</option><option>Diesel</option><option>Hybrid</option><option>Electric</option><option>LPG</option></select></label>
              <label className="field" style={{ flex: "1 1 130px" }}><span>Body</span><select className="input" name="body" defaultValue={f.body || ""}><option value="">Any</option><option>Sedan</option><option>Hatch</option><option>Wagon</option><option>SUV</option><option>Ute</option><option>Van</option><option>Tipper</option><option>Tray</option><option>Prime mover</option></select></label>
            </div>
          </details>
          {f.view && <input type="hidden" name="view" value={f.view} />}
          <button className="btn btn-blue" style={{ height: 54 }}>Search</button>
        </form>
        <div className="seg">
          {CATS.map(([k, l]) => <Link key={k} href={qs({ cat: k })} className={(f.cat || "") === k ? "on" : ""} style={{ height: 42, padding: "0 20px", borderRadius: 21, display: "flex", alignItems: "center", fontSize: 15, fontWeight: 600, background: (f.cat || "") === k ? "#FFFFFF" : "transparent", boxShadow: (f.cat || "") === k ? "0 1px 3px rgba(0,0,0,.12)" : "none" }}>{l}</Link>)}
        </div>
        <div className="pill-row" style={{ justifyContent: "center" }}>
          <Link className="pill pill-soft" href={qs({ view: "" })}>Live</Link>
          <Link className="pill pill-soft" href={qs({ view: "offers" })}>Make an offer</Link>
          <Link className="pill pill-soft" href={qs({ view: "closed" })}>Recently closed</Link>
          {labelParts.length > 0 && <SaveSearchButton query={{ ...f, page: undefined }} label={labelParts.join(" · ")} />}
        </div>
      </div>
      {err && <div className="notice bad">We couldn&apos;t load vehicles just now. <Link href={qs({})}>Try again</Link>.</div>}
      <div className="grid" aria-busy={!data}>
        {!data && !err && Array.from({ length: 8 }, (_, i) => <div key={i} className="card" style={{ minHeight: 360, background: "var(--panel)", borderRadius: 32 }} />)}
        {data && (data.lots.length ? data.lots.map((l) => <LotCard key={l.id} lot={l} cover={l.cover_path} />) : (
          <div className="empty"><b style={{ fontSize: 22 }}>No vehicles match yet.</b><span className="muted">Try another filter, or save this search and we&apos;ll tell you when one is listed.</span><Link className="btn btn-soft" href="/auctions">Show all vehicles</Link></div>
        ))}
      </div>
      {data && (page > 1 || data.hasMore) && (
        <nav className="pill-row" aria-label="Pages" style={{ justifyContent: "center", marginTop: 40 }}>
          {page > 1 && <Link className="btn btn-soft" href={qs({ page: String(page - 1) })}>‹ Previous</Link>}
          <span className="muted" style={{ alignSelf: "center" }}>Page {page}</span>
          {data.hasMore && <Link className="btn btn-soft" href={qs({ page: String(page + 1) })}>Next ›</Link>}
        </nav>
      )}
    </div>
  );
}
