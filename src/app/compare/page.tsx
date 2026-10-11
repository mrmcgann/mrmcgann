import type { Metadata } from "next";
import Link from "next/link";
import { getFeesCached, getLotCached } from "@/lib/cache";
import { CompareRemove } from "@/components/Compare";
import { CarArt } from "@/components/CarArt";
import { priceBreakdown, lotFees } from "@/lib/fees";
import { km, money } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { CAT, kindLabel } from "@/lib/vehicles";
import { RUNS, SELLER_TYPE, WRITE_OFF } from "@/lib/listing";
import { gradeInfo } from "@/lib/grades";
import type { Lot } from "@/lib/types";

export const metadata: Metadata = { title: "Compare vehicles", robots: { index: false } };

const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : null);
const STATUS: Record<string, string> = { live: "Live auction", scheduled: "Starting soon", offers: "Taking offers", referred: "Under offer", sold: "Sold", passed: "Ended" };

// Up to four vehicles side by side: the all-in price first (what you'd actually pay), then condition and the facts.
export default async function Compare({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const sp = await searchParams;
  const ids = [...new Set(String(sp.ids || "").split(",").map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 4);
  const [fees, bundles] = await Promise.all([getFeesCached(), Promise.all(ids.map((id) => getLotCached(id)))]);
  const items = bundles.filter((b): b is NonNullable<typeof b> => !!b && b.lot.status !== "draft");
  if (items.length < 2) {
    return (
      <div className="wrap" style={{ maxWidth: 720, padding: "clamp(48px,8vw,96px) 16px", display: "flex", flexDirection: "column", gap: 18 }}>
        <h1 className="d2">Compare vehicles.</h1>
        <p className="lede" style={{ margin: 0 }}>Tick &quot;Compare&quot; on two to four vehicles, then open the compare bar at the bottom of the screen.</p>
        <Link className="btn btn-blue" href="/auctions" style={{ alignSelf: "flex-start" }}>Browse auctions</Link>
      </div>
    );
  }
  const price = (l: Lot) => l.status === "sold" ? l.sold_price || 0 : l.buy_now_price && l.current_bid < l.buy_now_price ? Math.max(l.current_bid || 0, l.start_price || 0) : Math.max(l.current_bid || 0, l.start_price || 0);
  const rows: [string, (l: Lot) => React.ReactNode][] = [
    ["Current bid", (l) => <><b>{money(price(l))}</b><br /><span className="muted" style={{ fontSize: 13 }}>{money(priceBreakdown(price(l), lotFees(fees, l)).total, true)} all-in with fees</span></>],
    ["Buy Now", (l) => l.buy_now_price && l.current_bid < l.buy_now_price ? <><b>{money(l.buy_now_price)}</b><br /><span className="muted" style={{ fontSize: 13 }}>{money(priceBreakdown(l.buy_now_price, lotFees(fees, l)).total, true)} all-in</span></> : "No"],
    ["Status", (l) => <>{STATUS[l.status] || l.status}{l.status === "live" && l.ends_at ? <><br /><span className="muted" style={{ fontSize: 13 }}>Ends {when(l.ends_at)}</span></> : null}</>],
    ["Reserve", (l) => !l.has_reserve ? "No reserve" : l.reserve_met ? "Reserve met" : "Reserve not met"],
    ["Bids", (l) => String(l.bid_count || 0)],
    ["Year", (l) => l.year],
    ["Type", (l) => kindLabel(l.category, l.kind) || CAT[l.category]?.label],
    ["Odometer", (l) => l.odometer != null ? km(l.odometer) : l.hours != null ? `${l.hours.toLocaleString("en-AU")} hrs` : null],
    ["Transmission", (l) => l.transmission],
    ["Fuel", (l) => l.fuel],
    ["Drive", (l) => l.drive],
    ["Engine", (l) => [l.engine, l.engine_cc ? `${l.engine_cc.toLocaleString("en-AU")} cc` : null].filter(Boolean).join(" · ")],
    ["Visual grade", (l) => l.visual_grade ? `${l.visual_grade} · ${gradeInfo(l.visual_grade)[1]}` : null],
    ["Mechanic's inspection", (l) => l.inspected_at ? `Yes, ${new Date(l.inspected_at).toLocaleDateString("en-AU")}` : "Not before listing"],
    ["Starts and drives", (l) => l.runs ? RUNS[l.runs] : null],
    ["Write-off status", (l) => WRITE_OFF[l.write_off_status || "unknown"]],
    ["Registration", (l) => l.registration === "unregistered" ? "Unregistered" : l.registration === "registered" ? `Registered ${l.rego_state || l.state}${l.rego_expiry ? ` to ${new Date(l.rego_expiry).toLocaleDateString("en-AU")}` : ""}` : null],
    ["Service books", (l) => l.service_books === true ? "Yes" : l.service_books === false ? "No" : null],
    ["Seller", (l) => l.seller_type ? SELLER_TYPE[l.seller_type] : null],
    ["In-person viewing", (l) => l.in_person_viewing ? "By appointment" : "Video walkaround only"],
    ["Location", (l) => `${l.suburb}, ${l.state}`],
  ];
  return (
    <div className="wrap" style={{ padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 24 }}>
      <h1 className="d2">Compare.</h1>
      <div className="cmp-wrap">
        <table className="cmp-table" data-testid="compare-table">
          <thead><tr><th scope="col"><span className="sr-only">Vehicle</span></th>{items.map(({ lot, photos }) => (
            <th scope="col" key={lot.id}>
              <Link href={`/lot/${lot.id}`} className={`cmp-ph stage bg-${lot.backdrop}`}>{photos[0] ? <img src={photoUrl(photos[0].path)} alt="" /> : <CarArt type={lot.vehicle_type} />}</Link>
              <Link href={`/lot/${lot.id}`} className="cmp-t">{lot.title}</Link>
              <CompareRemove id={lot.id} ids={items.map((i) => i.lot.id)} />
            </th>
          ))}</tr></thead>
          <tbody>{rows.map(([label, f]) => (
            <tr key={label}><th scope="row">{label}</th>{items.map(({ lot }) => <td key={lot.id}>{f(lot) ?? <span className="muted">Not supplied</span>}</td>)}</tr>
          ))}</tbody>
        </table>
      </div>
      <p className="hint">All-in prices include the buyer&apos;s premium and fees at the price shown. Live prices change as people bid: open a vehicle to bid.</p>
    </div>
  );
}
