import Link from "next/link";
import { unstable_cache } from "next/cache";
import { facetsCached, getFeesCached, searchLotsCached } from "@/lib/cache";
import { supabasePublic } from "@/lib/supabase/anon";
import { LotCard } from "@/components/LotCard";
import { MAKES, STATE_NAMES, modelsFor } from "@/lib/vehicles";
import { money } from "@/lib/format";
import { searchHref } from "@/lib/search";
import { SOLD_WINDOW_DAYS, breadcrumbJsonLd, itemListJsonLd, jsonLd, slugify } from "@/lib/seo";
import { env } from "@/lib/env";
import type { Lot } from "@/lib/types";

// Landing pages for searches like "Toyota HiLux auction" and "HiLux sold prices": real live listings,
// real recent results and the price range from our own sales. Nothing invented; pages with nothing
// on them aren't indexed (thin pages hurt the whole site in Google).

export const makeFromSlug = (s: string) => Object.keys(MAKES).find((m) => slugify(m) === s) || null;
export const modelFromSlug = (make: string, s: string) => modelsFor(make).find((m) => slugify(m) === s) || null;

type Estimate = { count: number; low?: number; mid?: number; high?: number };
const estimateCached = (make: string, model: string) => unstable_cache(async () => {
  const { data } = await supabasePublic().rpc("price_estimate", { p_make: make, p_model: model, p_year: null });
  return (data || { count: 0 }) as Estimate;
}, ["estimate", make.toLowerCase(), model.toLowerCase(), "any"], { revalidate: 3600, tags: ["lots"] })();

const soldCountCached = (make: string, model: string | null) => unstable_cache(async () => {
  let q = supabasePublic().from("lots").select("id", { count: "exact", head: true }).eq("status", "sold").gt("sold_price", 0)
    .gte("ends_at", new Date(Date.now() - SOLD_WINDOW_DAYS * 86400000).toISOString()).ilike("make", make);
  if (model) q = q.ilike("model", model);
  return (await q).count || 0;
}, ["sold-count", make.toLowerCase(), (model || "").toLowerCase()], { revalidate: 3600, tags: ["lots"] })();

export async function makeData(make: string, model: string | null) {
  const f = { make, ...(model ? { model } : {}) };
  const [live, closed, facets, fees, est, soldCount] = await Promise.all([
    searchLotsCached(f), searchLotsCached({ ...f, view: "closed" }), facetsCached({ make }), getFeesCached(),
    model ? estimateCached(make, model) : Promise.resolve({ count: 0 } as Estimate), soldCountCached(make, model),
  ]);
  const sold = (closed as Lot[]).filter((l) => l.status === "sold" && l.sold_price).slice(0, 12);
  return { live: live as Lot[], sold, facets, fees, est, soldCount };
}

/** Indexed only with something on it: a live vehicle, or 3+ sales in the last 18 months. */
export const indexable = (d: Awaited<ReturnType<typeof makeData>>) => d.live.length > 0 || d.soldCount >= 3;

export function makeTitle(make: string, model: string | null) {
  return model ? `${make} ${model} for sale by auction` : `${make} for sale by auction`;
}

export function makeDescription(make: string, model: string | null, d: Awaited<ReturnType<typeof makeData>>) {
  const name = model ? `${make} ${model}` : make;
  const live = d.live.length ? `${d.live.length}${d.live.length > 48 ? "+" : ""} up for online auction now` : "None up for auction right now";
  const range = d.est.count >= 3 && d.est.low && d.est.high ? ` The middle half of recent sales: ${money(d.est.low)} to ${money(d.est.high)} (hammer prices).` : "";
  return `${name} for sale across Australia. ${live}.${range} Checked against the vehicle, PPSR searched, all-in prices shown.`;
}

export function MakePage({ make, model, data }: { make: string; model: string | null; data: Awaited<ReturnType<typeof makeData>> }) {
  const { live, sold, facets, fees, est } = data;
  const name = model ? `${make} ${model}` : make;
  const models = Object.entries(facets.models || {}).sort((a, b) => b[1] - a[1]);
  const known = modelsFor(make).filter((m) => !(facets.models || {})[m]).slice(0, 12);
  const states = Object.entries(facets.states || {}).sort((a, b) => b[1] - a[1]);
  const crumbs: [string, string][] = [["Home", "/"], ["Makes", "/makes"], [make, `/makes/${slugify(make)}`], ...(model ? [[model, `/makes/${slugify(make)}/${slugify(model)}`] as [string, string]] : [])];
  const soldPrices = sold.map((l) => Number(l.sold_price)).filter((n) => n > 0);
  return (
    <div className="wrap" style={{ paddingBlock: "clamp(40px,6vw,72px)", display: "flex", flexDirection: "column", gap: 28 }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd([breadcrumbJsonLd(crumbs, env.siteUrl), ...(live.length ? [itemListJsonLd(live, env.siteUrl)] : [])]) }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 820 }}>
        <nav aria-label="Breadcrumb" className="crumbs left">{crumbs.map(([n, href], i) => <span key={href}>{i === crumbs.length - 1 ? n : <Link href={href}>{n}</Link>}{i < crumbs.length - 1 && <span aria-hidden="true"> › </span>}</span>)}</nav>
        <h1 className="d2" data-testid="make-title">{makeTitle(make, model)}.</h1>
        <p className="lede" style={{ margin: 0 }}>
          {live.length ? `${live.length}${live.length > 48 ? "+" : ""} ${name} up for online auction across Australia right now.` : `No ${name} is up for auction right now. Save a search and we'll tell you as soon as one is listed.`}
          {" "}Every vehicle is checked against its listing before it goes live, PPSR searched for finance and write-offs, and shown with its all-in price.
        </p>
        {est.count >= 3 && est.low && est.mid && est.high && (
          <div className="notice" data-testid="make-range">Recent {name} sales on Tyrebiter: the middle half sold for between <b>{money(est.low)}</b> and <b>{money(est.high)}</b> (median {money(est.mid)}), from {est.count} sales in the last 18 months. Hammer prices, before the buyer&apos;s premium and fees; every vehicle is different.</div>
        )}
        {!model && models.length > 0 && <div className="pill-row">{models.slice(0, 16).map(([m, n]) => <Link key={m} className="pill pill-soft" href={`/makes/${slugify(make)}/${slugify(m)}`}>{m} ({n})</Link>)}</div>}
      </div>
      {live.length > 0 && <div className="grid">{live.slice(0, 24).map((l) => <LotCard key={l.id} lot={l} cover={l.cover_path || undefined} fees={fees} />)}</div>}
      <Link className="btn btn-dark" style={{ alignSelf: "center" }} href={searchHref({ make, ...(model ? { model } : {}) })}>{live.length ? `Search all ${name} with filters` : `Save a search for ${name}`}</Link>
      {sold.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <h2 className="d3" style={{ fontSize: 36 }}>Recent {name} auction results.</h2>
          <div className="rows">{sold.map((l) => <div key={l.id}><Link className="blue" href={`/lot/${l.id}`}>{l.title}</Link><b>{money(l.sold_price)}<span className="muted" style={{ fontWeight: 500 }}>{l.state ? ` · ${l.state}` : ""}{l.ends_at ? ` · ${new Date(l.ends_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : ""}</span></b></div>)}</div>
          {soldPrices.length >= 2 && <p className="hint" style={{ margin: 0 }}>These {soldPrices.length} sold between {money(Math.min(...soldPrices))} and {money(Math.max(...soldPrices))}. Hammer prices, before the buyer&apos;s premium and fees. Past results don&apos;t predict what any vehicle will sell for.</p>}
        </section>
      )}
      {(model || !models.length) && known.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="d3" style={{ fontSize: 30 }}>Other {make} models.</h2>
          <div className="pill-row">{known.filter((m) => m !== model).map((m) => <Link key={m} className="pill pill-soft" href={`/makes/${slugify(make)}/${slugify(m)}`}>{m}</Link>)}</div>
        </section>
      )}
      {states.length > 0 && (
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="d3" style={{ fontSize: 30 }}>{make} by state.</h2>
          <div className="pill-row">{states.map(([s, n]) => <Link key={s} className="pill pill-soft" href={searchHref({ make, ...(model ? { model } : {}), state: s })}>{STATE_NAMES[s] || s} ({n})</Link>)}</div>
        </section>
      )}
      <section style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 820 }}>
        <h2 className="d3" style={{ fontSize: 30 }}>Selling a {name}?</h2>
        <p className="muted" style={{ margin: 0 }}>We photograph it at your place, check it against the listing, and auction it to verified buyers Australia-wide. <Link className="blue" href="/sell" style={{ fontWeight: 700 }}>Get a free appraisal ›</Link></p>
      </section>
    </div>
  );
}
