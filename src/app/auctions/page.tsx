import Link from "next/link";
import type { Metadata } from "next";
import { getSession } from "@/lib/auth";
import { getCovers, getWatchedIds, searchLots, type Filters } from "@/lib/data";
import { LotCard } from "@/components/LotCard";
import { SaveSearchButton } from "@/components/SaveSearchButton";
import { STATES } from "@/lib/grades";

export const metadata: Metadata = { title: "Live auctions" };
export const dynamic = "force-dynamic";

const CATS = [["", "All"], ["cars", "Cars"], ["utes", "Utes"], ["trucks", "Trucks"], ["cheap", "Under $5k"]];

export default async function Auctions({ searchParams }: { searchParams: Promise<Filters> }) {
  const f = await searchParams;
  const { supabase, user } = await getSession();
  const lots = await searchLots(supabase, f);
  const watched = await getWatchedIds(supabase, user?.id);
  const covers = await getCovers(supabase, lots);
  const qs = (patch: Partial<Filters>) => {
    const p = new URLSearchParams(Object.entries({ ...f, ...patch }).filter(([, v]) => v) as [string, string][]);
    const s = p.toString();
    return `/auctions${s ? `?${s}` : ""}`;
  };
  const heading = f.view === "offers" ? "Make an offer." : f.view === "closed" ? "Recently closed." : f.cat === "cheap" ? "Under $5,000." : f.cat ? `${f.cat[0].toUpperCase()}${f.cat.slice(1)}.` : "Live auctions.";
  const labelParts = [f.q && `“${f.q}”`, f.cat && CATS.find((c) => c[0] === f.cat)?.[1], f.state, f.max && `under $${Number(f.max).toLocaleString("en-AU")}`].filter(Boolean);

  return (
    <div className="wrap">
      <div className="center" style={{ gap: 22, padding: "clamp(40px,6vw,72px) 0 40px" }}>
        <h1 className="d2">{heading}</h1>
        <form className="formcard" action="/auctions" style={{ width: "min(980px,100%)", flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end", padding: 20, borderRadius: 28 }}>
          <label className="field" style={{ flex: "2 1 240px" }}><span>Search</span><input className="input" name="q" defaultValue={f.q || ""} placeholder="Make, model, suburb or lot number" /></label>
          <label className="field" style={{ flex: "1 1 120px" }}><span>Type</span>
            <select className="input" name="cat" defaultValue={f.cat || ""}>{CATS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="field" style={{ flex: "1 1 110px" }}><span>State</span>
            <select className="input" name="state" defaultValue={f.state || ""}><option value="">All</option>{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className="field" style={{ flex: "1 1 140px" }}><span>Max current bid</span>
            <select className="input" name="max" defaultValue={f.max || ""}><option value="">No limit</option>{[5000, 10000, 20000, 50000].map((n) => <option key={n} value={n}>${n.toLocaleString("en-AU")}</option>)}</select></label>
          <label className="field" style={{ flex: "1 1 150px" }}><span>Sort</span>
            <select className="input" name="sort" defaultValue={f.sort || "ending"}><option value="ending">Ending soonest</option><option value="newest">Newly listed</option><option value="price">Lowest bid</option><option value="price_desc">Highest bid</option></select></label>
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
          {labelParts.length > 0 && <SaveSearchButton query={{ ...f }} label={labelParts.join(" · ")} signedIn={!!user} />}
        </div>
      </div>
      <div className="grid">
        {lots.length ? lots.map((l) => <LotCard key={l.id} lot={l} watched={watched.has(l.id)} cover={covers.get(l.id)} />) : (
          <div className="empty"><b style={{ fontSize: 22 }}>No vehicles match yet.</b><span className="muted">Try another filter, or save this search and we&apos;ll tell you when one is listed.</span><Link className="btn btn-soft" href="/auctions">Show all vehicles</Link></div>
        )}
      </div>
    </div>
  );
}
