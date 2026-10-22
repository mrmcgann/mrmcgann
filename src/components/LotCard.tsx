import Link from "next/link";
import type { Fees, Lot } from "@/lib/types";
import { priceBreakdown, lotFees } from "@/lib/fees";
import { CarArt } from "@/components/CarArt";
import { Countdown } from "@/components/Countdown";
import { WatchButton } from "@/components/WatchButton";
import { CompareToggle } from "@/components/Compare";
import { dayShort, money } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { specLine } from "@/lib/vehicles";
import { allInMoney, estimateAllInText, estimateText, hasEstimate } from "@/lib/estimate";
import { premiumLabel } from "@/lib/transport";

// Every price on a card has its all-in amount beside it, in the same size (the single price must be at least as
// prominent as any part of it). Like any advertisement for the auction, a card says the buyer's premium applies and
// whether there's a statutory warranty.
export function LotCard({ lot, watched, cover, fees }: { lot: Lot; watched?: boolean; cover?: string | null; fees?: Fees }) {
  const ends = lot.ends_at ? new Date(lot.ends_at).getTime() : 0;
  const soon = lot.status === "live" && ends - Date.now() < 86400000;
  const label = lot.status === "live" ? (lot.live_state === "waiting" ? `Live auction · ${dayShort(lot.ends_at)}` : lot.live_state === "open" ? "Up now, live" : null)
    : lot.status === "sold" ? "Sold" : lot.status === "offers" ? "Make an offer" : lot.status === "referred" ? "Under offer" : lot.status === "passed" ? "Passed in" : "Ended";
  const tender = lot.method === "tender" && lot.status === "live";
  const fl = fees ? lotFees(fees, lot) : null;
  const upNow = lot.status === "live" && lot.live_state === "open";
  const showEstimate = hasEstimate(lot) && lot.status !== "sold" && !upNow;
  const bid = Math.max(lot.current_bid || 0, lot.start_price || 0);
  const terms = [lot.status !== "sold" && fl ? premiumLabel(fl) : null, lot.statutory_warranty === false ? "No statutory warranty" : lot.statutory_warranty ? "Statutory warranty applies" : null].filter(Boolean).join(" · ");
  return (
    <article className="card">
      <Link href={`/lot/${lot.id}`} className={`stage bg-${lot.backdrop}`} aria-label={lot.title} style={{ display: "block" }}>
        {cover ? <img className="lotimg" src={photoUrl(cover)} alt="" /> : <CarArt type={lot.vehicle_type} />}
        {label ? <span className={`time ${lot.live_state && lot.status === "live" ? "live" : "ended"}`}>{label}</span> : <span className={`time${soon ? " soon" : ""}`}>{tender ? "Tender · " : ""}<Countdown endsAt={lot.ends_at} /></span>}
        <WatchButton lotId={lot.id} initial={watched} title={lot.title} />
        {(lot.visual_grade || lot.inspected_at) && <span className={`grade${lot.inspected_at ? " insp-on" : ""}`} data-testid={lot.inspected_at ? "card-inspected" : undefined}>{[lot.inspected_at ? "Inspected" : null, lot.visual_grade ? `Visual grade ${lot.visual_grade}` : null].filter(Boolean).join(" · ")}</span>}
        {lot.status === "live" && !tender && lot.has_reserve && !lot.reserve_met && lot.bid_count > 0 && <span className="status-tag" style={{ background: "var(--sun)", color: "var(--ink)" }}>Reserve not met</span>}
      </Link>
      <Link href={`/lot/${lot.id}`} className="meta">
        <span className="loc">{lot.suburb} {lot.state}</span>
        <span className="ttl">{lot.title}</span>
        <span className="muted">{[specLine(lot) || [lot.year, lot.make].filter(Boolean).join(" "), lot.registration === "unregistered" ? "Unregistered" : null].filter(Boolean).join(" · ")}</span>
        {tender ? (
          <span className="price" data-testid="card-tender">
            <b>Tenders from {money(lot.start_price)}</b>
            <span className="muted">{lot.tender_count || 0} tender{lot.tender_count === 1 ? "" : "s"}</span>
          </span>
        ) : showEstimate ? (
          <span className="pricerows" data-testid="card-estimate">
            <span><span>Estimate</span><b>{estimateText(lot)}</b></span>
            {fl && <span><span>All-in</span><b data-testid="card-allin">{estimateAllInText(lot, fl)}</b></span>}
          </span>
        ) : (
          <span className="pricerows">
            <span><span>{lot.status === "sold" ? "Sold for" : lot.bid_count ? "Current bid" : "Opening bid"}</span><b>{money(lot.status === "sold" ? lot.sold_price : bid)}</b></span>
            {fl && lot.status !== "sold" && <span><span>All-in</span><b data-testid="card-allin">{allInMoney(priceBreakdown(bid, fl).total)}</b></span>}
          </span>
        )}
        {!tender && lot.status !== "sold" && <span className="muted" style={{ fontSize: 14 }}>{lot.bid_count ? `${lot.bid_count} ${lot.live_state === "waiting" ? "early " : ""}bid${lot.bid_count === 1 ? "" : "s"}` : lot.live_state === "waiting" ? "Leave an early bid" : "No bids yet"}</span>}
        {terms && <span className="cardterms" data-testid="card-terms">{terms}</span>}
      </Link>
      {lot.status !== "sold" && <CompareToggle id={lot.id} title={lot.title} small />}
    </article>
  );
}
