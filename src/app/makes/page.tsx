import type { Metadata } from "next";
import Link from "next/link";
import { facetsCached, getSettingsCached } from "@/lib/cache";
import { CATEGORIES, makesFor, sellCategories, sellPlace, sellStates } from "@/lib/vehicles";
import { slugify } from "@/lib/seo";
import { env } from "@/lib/env";

export const revalidate = 600;
export const metadata: Metadata = {
  title: "Browse trucks by make",
  description: "Trucks for sale by live online auction in Queensland, by make and model.",
  alternates: { canonical: `${env.siteUrl}/makes` },
};

// Every make, with how many are up for auction now: the hub that links to every make and model page.
export default async function Makes() {
  const [facets, settings] = await Promise.all([facetsCached({}), getSettingsCached().catch(() => ({} as Record<string, Record<string, unknown>>))]);
  const counts = facets.makes || {};
  // only what we sell (trucks to start), where we sell it
  const selling = settings.selling as { categories?: unknown; states?: unknown } | undefined;
  const sold = sellCategories(selling);
  const cats = CATEGORIES.filter((c) => sold.includes(c.key));
  return (
    <div className="wrap" style={{ paddingBlock: "clamp(40px,6vw,72px)", display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 820 }}>
        <span className="eyebrow" style={{ color: "var(--urgent)" }}>Live auctions · {sellPlace(sellStates(selling))}</span>
        <h1 className="d2">Browse by make.</h1>
        <p className="lede" style={{ margin: 0 }}>Pick a make to see what&apos;s up for auction now and what similar {cats.length === 1 ? `${cats[0].one}s` : "vehicles"} have sold for.</p>
      </div>
      {cats.map((c) => {
        const makes = makesFor(c.key);
        if (!makes.length) return null;
        return (
          <div key={c.key} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {cats.length > 1 && <h2 className="d3" style={{ fontSize: 30 }}><Link href={`/for-sale/${c.key}`}>{c.label}</Link></h2>}
            <div className="pill-row">{makes.map((m) => <Link key={m} className="pill pill-soft" href={`/makes/${slugify(m)}`}>{m}{counts[m] ? ` (${counts[m]})` : ""}</Link>)}</div>
          </div>
        );
      })}
    </div>
  );
}
