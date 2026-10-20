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
        <h1 className="d2">Fleet sales and live auctions.</h1>
        <p className="lede" style={{ margin: 0 }}>Groups of vehicles sold together. In a fleet sale they close one after another, a few minutes apart. In a live auction an auctioneer offers them one at a time, and you bid online as it happens. <Link className="blue" href="/calendar">See the calendar ›</Link></p>
      </div>
      {sales.length === 0 && <div className="empty"><b style={{ fontSize: 20 }}>No sales on right now.</b><Link className="blue" href="/auctions">See every live auction ›</Link></div>}
      <div className="grid">
        {sales.map((x) => (
          <Link key={x.id} href={x.mode === "live" ? `/live/${x.slug}` : `/sales/${x.slug}`} className="soft" style={{ gap: 8, textDecoration: "none", color: "inherit" }}>
            <span className="eyebrow" style={{ color: "var(--urgent)" }}>{[x.seller_label, x.state].filter(Boolean).join(" · ")}</span>
            <b style={{ fontSize: 24, letterSpacing: "-0.02em" }}>{x.title}</b>
            <span className="muted">{x.mode === "live"
              ? `Live auction · ${x.live_status === "running" ? "on now" : x.live_status === "ended" ? `finished · ${x.stats.sold} sold` : `starts ${dateTime(x.starts_at)}`} · ${x.stats.total} vehicles`
              : x.stats.live ? `${x.stats.live} live${x.stats.first_end ? ` · first closes ${dateTime(x.stats.first_end)}` : ""}` : `${x.stats.sold} sold`}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
