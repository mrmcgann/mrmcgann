import Link from "next/link";
import { facetsCached, getFeesCached, searchLotsCached } from "@/lib/cache";
import { LotCard } from "@/components/LotCard";
import { CAT, STATE_NAMES, type CategoryKey } from "@/lib/vehicles";
import { money } from "@/lib/format";
import { searchHref } from "@/lib/search";
import type { Lot } from "@/lib/types";

// Landing pages for search engines: "Utes for sale in Queensland". Real listings and real recent
// results only: no made-up counts, prices or claims. Pages with nothing on them aren't indexed.
export async function forSaleData(cat: CategoryKey, state: string | null) {
  const f = { cat, ...(state ? { state } : {}) };
  const [live, closed, facets, fees] = await Promise.all([searchLotsCached(f), searchLotsCached({ ...f, view: "closed" }), facetsCached(f), getFeesCached()]);
  return { live: live as Lot[], sold: (closed as Lot[]).filter((l) => l.status === "sold" && l.sold_price).slice(0, 8), facets, fees };
}

export function forSaleTitle(cat: CategoryKey, state: string | null) {
  const label = CAT[cat].label;
  return state ? `${label} for sale in ${STATE_NAMES[state]}` : `${label} for sale in Australia`;
}

export function ForSalePage({ cat, state, data }: { cat: CategoryKey; state: string | null; data: Awaited<ReturnType<typeof forSaleData>> }) {
  const c = CAT[cat];
  const where = state ? STATE_NAMES[state] : "Australia";
  const { live, sold, facets, fees } = data;
  const makes = Object.entries(facets.makes || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const states = Object.entries(facets.states || {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className="wrap" style={{ paddingBlock: "clamp(40px,6vw,72px)", display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 820 }}>
        <span className="eyebrow" style={{ color: "var(--urgent)" }}>{state ? <><Link href={`/for-sale/${cat}`}>{c.label}</Link> · {where}</> : "Online auctions · Australia-wide"}</span>
        <h1 className="d2" data-testid="forsale-title">{forSaleTitle(cat, state)}.</h1>
        <p className="lede" style={{ margin: 0 }}>
          {live.length ? `${live.length}${live.length > 48 ? "+" : ""} ${live.length === 1 ? c.one : c.label.toLowerCase()} up for online auction${state ? ` in ${where}` : " across Australia"} right now.` : `No ${c.label.toLowerCase()} are up for auction${state ? ` in ${where}` : ""} right now. Save a search and we'll tell you when one is listed.`}
          {" "}Every vehicle is checked against its listing before it goes live, PPSR searched, and shown with its all-in price. Order a mobile inspection or call the vehicle&apos;s consultant, bid online, and collect after payment and transfer, or have it delivered.
        </p>
        {makes.length > 0 && <div className="pill-row">{makes.map(([m, n]) => <Link key={m} className="pill pill-soft" href={searchHref({ cat, make: m, ...(state ? { state } : {}) })}>{m} ({n})</Link>)}</div>}
      </div>
      {live.length > 0 && <div className="grid">{live.slice(0, 24).map((l) => <LotCard key={l.id} lot={l} cover={l.cover_path || undefined} fees={fees} />)}</div>}
      <Link className="btn btn-dark" style={{ alignSelf: "center" }} href={searchHref({ cat, ...(state ? { state } : {}) })}>{live.length ? `Search all ${c.label.toLowerCase()} with filters` : "Search and save alerts"}</Link>
      {sold.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 className="d3" style={{ fontSize: 36 }}>Recently sold{state ? ` in ${where}` : ""}.</h2>
          <div className="rows">{sold.map((l) => <div key={l.id}><Link className="blue" href={`/lot/${l.id}`}>{l.title}</Link><b>{money(l.sold_price)}{l.ends_at ? <span className="muted" style={{ fontWeight: 500 }}> · {new Date(l.ends_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span> : null}</b></div>)}</div>
          <p className="hint" style={{ margin: 0 }}>Hammer prices, before the buyer&apos;s premium and fees. Past results don&apos;t predict what any vehicle will sell for.</p>
        </section>
      )}
      {!state && states.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="d3" style={{ fontSize: 30 }}>By state.</h2>
          <div className="pill-row">{Object.keys(STATE_NAMES).map((s) => <Link key={s} className="pill pill-soft" href={`/for-sale/${cat}/${s.toLowerCase()}`}>{STATE_NAMES[s]}{facets.states?.[s] ? ` (${facets.states[s]})` : ""}</Link>)}</div>
        </section>
      )}
    </div>
  );
}
