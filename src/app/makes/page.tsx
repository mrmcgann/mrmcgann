import type { Metadata } from "next";
import Link from "next/link";
import { facetsCached } from "@/lib/cache";
import { CATEGORIES, makesFor } from "@/lib/vehicles";
import { slugify } from "@/lib/seo";
import { env } from "@/lib/env";

export const revalidate = 600;
export const metadata: Metadata = {
  title: "Browse vehicles by make",
  description: "Cars, utes, trucks, motorbikes, caravans, boats and machinery for sale by online auction across Australia, by make and model.",
  alternates: { canonical: `${env.siteUrl}/makes` },
};

// Every make, with how many are up for auction now: the hub that links to every make and model page.
export default async function Makes() {
  const facets = await facetsCached({});
  const counts = facets.makes || {};
  return (
    <div className="wrap" style={{ paddingBlock: "clamp(40px,6vw,72px)", display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 820 }}>
        <span className="eyebrow" style={{ color: "var(--urgent)" }}>Online auctions · Australia-wide</span>
        <h1 className="d2">Browse by make.</h1>
        <p className="lede" style={{ margin: 0 }}>Pick a make to see what&apos;s up for auction now and what similar vehicles have sold for.</p>
      </div>
      {CATEGORIES.map((c) => {
        const makes = makesFor(c.key);
        if (!makes.length) return null;
        return (
          <section key={c.key} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 className="d3" style={{ fontSize: 30 }}><Link href={`/for-sale/${c.key}`}>{c.label}</Link></h2>
            <div className="pill-row">{makes.map((m) => <Link key={m} className="pill pill-soft" href={`/makes/${slugify(m)}`}>{m}{counts[m] ? ` (${counts[m]})` : ""}</Link>)}</div>
          </section>
        );
      })}
    </div>
  );
}
