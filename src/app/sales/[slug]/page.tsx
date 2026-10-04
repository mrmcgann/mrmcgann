import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFeesCached, getSaleCached, searchLotsCached } from "@/lib/cache";
import { LotCard } from "@/components/LotCard";
import { PAGE_SIZE } from "@/lib/data";
import { dateTime } from "@/lib/format";
import type { Lot } from "@/lib/types";

export const revalidate = 30;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const sale = await getSaleCached(slug).catch(() => null);
  if (!sale) return { title: "Sale not found" };
  return { title: sale.title, description: sale.intro?.slice(0, 160) || `${sale.title}: vehicles sold together online at Tyrebiter.`, alternates: { canonical: `/sales/${sale.slug}` } };
}

// One seller's vehicles together (a fleet, a council, a finance company), closing a few minutes apart.
export default async function SalePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sale = await getSaleCached(slug);
  if (!sale) notFound();
  const live = (await searchLotsCached({ sale: String(sale.id) })) as Lot[];
  const closed = live.length ? [] : ((await searchLotsCached({ sale: String(sale.id), view: "closed" })) as Lot[]);
  const shown = (live.length ? live : closed).slice(0, PAGE_SIZE);
  const more = live.length > PAGE_SIZE;
  const fees = await getFeesCached();
  return (
    <div className="wrap" style={{ paddingBlock: "clamp(40px,6vw,72px)", display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 820 }}>
        <Link className="more" href="/sales" style={{ fontSize: 15 }}>‹ All sales</Link>
        <span className="eyebrow" style={{ color: "var(--urgent)" }}>{[sale.seller_label, sale.state].filter(Boolean).join(" · ") || "Sale"}</span>
        <h1 className="d2" data-testid="sale-title">{sale.title}.</h1>
        {sale.intro && <p className="lede" style={{ margin: 0, whiteSpace: "pre-line" }}>{sale.intro}</p>}
        <div className="stat-row">
          <span>{sale.stats.live} live</span>
          {sale.stats.first_end && <span>First closes {dateTime(sale.stats.first_end)}</span>}
          {sale.stats.last_end && sale.stats.last_end !== sale.stats.first_end && <span>Last closes {dateTime(sale.stats.last_end)}</span>}
        </div>
        <p className="hint" style={{ margin: 0 }}>Each vehicle has its own auction and closes on its own time, a few minutes apart. A bid in the last minutes extends only that vehicle. Every vehicle is at the seller&apos;s location: order a mobile inspection or call the consultant on the listing.</p>
      </div>
      {!live.length && closed.length > 0 && <h2 className="d3">Results.</h2>}
      {shown.length === 0 ? <div className="empty"><b style={{ fontSize: 20 }}>Vehicles are being added.</b><span className="muted">Check back soon.</span></div>
        : <div className="grid">{shown.map((l) => <LotCard key={l.id} lot={l} cover={l.cover_path || undefined} fees={fees} />)}</div>}
      {more && <Link className="btn btn-dark" href={`/auctions?sale=${sale.id}`} style={{ alignSelf: "center" }}>See all {sale.stats.live} vehicles with filters</Link>}
    </div>
  );
}
