import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getFeesCached } from "@/lib/cache";
import type { Lot } from "@/lib/types";
import { DeleteSearch } from "@/components/WatchRowControls";
import { WatchBoard, type WatchItem } from "@/components/watchlist/WatchBoard";
import { photoUrl } from "@/lib/photos";
import { specLine } from "@/lib/vehicles";

export const metadata: Metadata = { title: "Watchlist" };
export const dynamic = "force-dynamic";

type WatchRow = { lot_id: number; remind: boolean; note?: string | null; created_at: string; lots: Lot };

// Everything you're watching and everything you've bid on, with live prices (see WatchBoard).
export default async function Watchlist({ searchParams }: { searchParams: Promise<{ f?: string; sort?: string }> }) {
  const { f = "all", sort = "ending" } = await searchParams;
  const { supabase, user } = await getSession();
  if (!user) redirect("/signin?next=/watchlist");
  const [{ data: rows }, { data: maxes }, { data: searches }, fees] = await Promise.all([
    supabase.from("watchlist").select("lot_id, remind, note, created_at, lots(*)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500),
    supabase.from("max_bids").select("lot_id, max_amount, updated_at, lots(*)").eq("bidder_id", user.id).order("updated_at", { ascending: false }).limit(300),
    supabase.from("saved_searches").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    getFeesCached(),
  ]);
  const myMax = new Map((maxes || []).map((m: { lot_id: number; max_amount: number }) => [m.lot_id, Number(m.max_amount)]));
  const items = new Map<number, WatchItem>();
  const toItem = (l: Lot, extra: Partial<WatchItem>): WatchItem => ({
    id: l.id, title: l.title, status: l.status, ends_at: l.ends_at, current_bid: Number(l.current_bid || 0), bid_count: l.bid_count, start_price: Number(l.start_price || 0),
    reserve_met: l.reserve_met, has_reserve: l.has_reserve, leader_id: l.leader_id, winner_id: l.winner_id, sold_price: l.sold_price, decision_by: l.decision_by,
    buy_now_price: l.buy_now_price, seller_type: l.seller_type ?? null, fees: (l as Lot & { fees?: WatchItem["fees"] }).fees ?? null, backdrop: l.backdrop, vehicle_type: l.vehicle_type,
    cover: l.cover_path ? photoUrl(l.cover_path) : null, place: [l.suburb, l.state].filter(Boolean).join(", "), spec: specLine(l) || [l.year, l.make, l.model].filter(Boolean).join(" "),
    year: l.year, grade: l.visual_grade, is_seller: (l as Lot & { seller_id?: string | null }).seller_id === user.id,
    my_max: myMax.get(l.id) ?? null, watched: false, remind: false, note: null, added_at: null, ...extra,
  });
  for (const r of (rows || []) as unknown as WatchRow[]) if (r.lots) items.set(r.lot_id, toItem(r.lots, { watched: true, remind: r.remind, note: r.note || null, added_at: r.created_at }));
  // every vehicle you've bid on shows here too, even if you've stopped watching it
  for (const m of (maxes || []) as unknown as { lot_id: number; updated_at: string; lots: Lot }[]) {
    if (m.lots && !items.has(m.lot_id) && m.lots.status !== "draft") items.set(m.lot_id, toItem(m.lots, { added_at: m.updated_at }));
  }
  const colours = ["sun", "sky", "lime", "berry", "mint", "lilac"];

  return (
    <div className="wrap">
      <div className="acctgrid">
        <nav className="side-nav" aria-label="Account">
          <span className="h">Buying</span>
          <Link href="/watchlist" className="on">Watchlist<span>{items.size}</span></Link>
          <Link href="/watchlist?f=winning">My bids</Link>
          <Link href="/watchlist#searches">Saved searches</Link>
          <span className="h">Account</span>
          <Link href="/account">Account &amp; verification</Link>
          <Link href="/account#invoices">Invoices</Link>
          <Link href="/account/notifications">Notifications</Link>
        </nav>
        <div style={{ display: "flex", flexDirection: "column", gap: 28, minWidth: 0 }}>
          <WatchBoard items={[...items.values()]} fees={fees} userId={user.id} initialTab={f} initialSort={sort} />
          <div id="searches" style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, flexWrap: "wrap" }}>
              <h2 className="d3" style={{ fontSize: 44 }}>Saved searches.</h2>
              <Link className="more" style={{ fontSize: 17 }} href="/auctions">New saved search ›</Link>
            </div>
            {searches?.length ? (
              <div className="ss">
                {searches.map((s: { id: string; label: string; query: Record<string, string> }, i: number) => (
                  <div key={s.id} className={`bg-${colours[i % colours.length]}`}>
                    <b style={{ fontSize: 19, letterSpacing: "-0.02em" }}>{s.label}</b>
                    <span style={{ fontWeight: 500 }}>We&apos;ll alert you to new matches.</span>
                    <span style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 8 }}>
                      <Link className="tag" style={{ background: "var(--ink)", color: "#FFFFFF", height: 32 }} href={`/auctions?${new URLSearchParams(s.query).toString()}`}>See matches ›</Link>
                      <DeleteSearch id={s.id} label={s.label} />
                    </span>
                  </div>
                ))}
              </div>
            ) : <div className="empty" style={{ padding: 36 }}><span className="muted">No saved searches yet. Search or filter the auctions, then tap <b>Save this search</b>.</span></div>}
          </div>
        </div>
      </div>
    </div>
  );
}
