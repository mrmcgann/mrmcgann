import type { Metadata } from "next";
import Link from "next/link";
import { getSalesCached } from "@/lib/cache";
import { dateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "Fleet and business sales",
  description: "Vehicles from fleets, councils, companies and finance companies, sold together online with staggered closing times.",
};
export const revalidate = 60;

export default async function Sales() {
  const sales = await getSalesCached();
  return (
    <div className="wrap" style={{ paddingBlock: "clamp(40px,6vw,72px)", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 760 }}>
        <span className="eyebrow" style={{ color: "var(--grape)" }}>Sales</span>
        <h1 className="d2">Fleet and business sales.</h1>
        <p className="lede" style={{ margin: 0 }}>Groups of vehicles from one seller, sold together. Vehicles close one after another, a few minutes apart, so you can follow each one.</p>
      </div>
      {sales.length === 0 && <div className="empty"><b style={{ fontSize: 20 }}>No sales on right now.</b><Link className="blue" href="/auctions">See every live auction ›</Link></div>}
      <div className="grid">
        {sales.map((x) => (
          <Link key={x.id} href={`/sales/${x.slug}`} className="soft" style={{ gap: 8, textDecoration: "none", color: "inherit" }}>
            <span className="eyebrow" style={{ color: "var(--urgent)" }}>{[x.seller_label, x.state].filter(Boolean).join(" · ")}</span>
            <b style={{ fontSize: 24, letterSpacing: "-0.02em" }}>{x.title}</b>
            <span className="muted">{x.stats.live ? `${x.stats.live} live${x.stats.first_end ? ` · first closes ${dateTime(x.stats.first_end)}` : ""}` : `${x.stats.sold} sold`}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
