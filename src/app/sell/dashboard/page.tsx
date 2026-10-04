import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import type { Lot } from "@/lib/types";
import { money, dateLong, dateTime } from "@/lib/format";
import { env } from "@/lib/env";
import { SellerDecision } from "./SellerDecision";
import { SellerVideos } from "./SellerVideos";
import { BlurName } from "@/components/BidPanel";
import { VIDEO_OPEN_STATUSES } from "@/lib/videos";
import { rulesFor } from "@/lib/transfer";
import { SellerTransferDone } from "./SellerTransfer";

export const metadata: Metadata = { title: "My vehicles for sale", robots: { index: false } };
export const dynamic = "force-dynamic";

const STATUS: Record<string, [string, string]> = {
  draft: ["Getting ready", "var(--panel)"], scheduled: ["Scheduled", "var(--sky)"], live: ["Live now", "var(--mint)"],
  referred: ["Decision needed", "var(--sun)"], offers: ["Taking offers", "var(--sun)"], sold: ["Sold", "var(--lime)"],
  passed: ["Didn't sell", "var(--panel)"], cancelled: ["Withdrawn", "var(--panel)"],
};

type Offer = { id: string; amount: number; status: string; created_at: string };
type Coll = { status: string; confirmed_for: string | null; collector: string; seller_token: string | null; collected_at: string | null };
type Payout = { id: string; lot_id: number; status: string; net_amount: number; hold_reason: string | null; paid_at: string | null };
type Bid = { amount: number; created_at: string; bidder_mask: string; is_auto: boolean };
type Video = { id: string; lot_id: number; title: string; status: string; review_note: string | null; created_at: string };
type Transfer = { registration: string; rego_state: string | null; status: string; buyer_choice: string | null; seller_done_at: string | null; seller_reference: string | null };
// Grouped like a seller portal: Pending, Active, Referred, Sold, Unsold.
const TABS: [string, string, string[]][] = [["pending", "Pending", ["draft", "scheduled"]], ["active", "Active", ["live"]], ["referred", "Referred", ["referred", "offers"]], ["sold", "Sold", ["sold"]], ["unsold", "Unsold", ["passed", "cancelled"]]];
const HAS_BIDS = ["live", "referred", "offers", "sold", "passed"];

// The seller's own view: live bids, watchers, decisions, collection and payout.
export default async function SellerDashboard({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase, user } = await getSession();
  if (!user) redirect("/signin?next=/sell/dashboard");
  const { data: rows } = await supabase.from("lots").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }).limit(50);
  const all = (rows || []) as Lot[];
  const count = (st: string[]) => all.filter((l) => st.includes(l.status)).length;
  const { tab: asked } = await searchParams;
  const tab = TABS.find(([k]) => k === asked)?.[0] || (count(["referred", "offers"]) ? "referred" : count(["live"]) ? "active" : count(["sold"]) ? "sold" : count(["draft", "scheduled"]) ? "pending" : "active");
  const lots = all.filter((l) => TABS.find(([k]) => k === tab)![2].includes(l.status));
  const { data: payouts } = await supabase.from("seller_payouts").select("id, lot_id, status, net_amount, hold_reason, paid_at").eq("seller_id", user.id);
  const { data: vids } = lots.length ? await supabase.from("lot_videos").select("id, lot_id, title, status, review_note, created_at").in("lot_id", lots.map((l) => l.id)).neq("status", "removed").order("created_at") : { data: [] };
  const extra = await Promise.all(lots.map(async (l) => {
    const [offers, coll, watchers, bids, tr] = await Promise.all([
      ["referred", "offers"].includes(l.status) ? supabase.rpc("seller_lot_offers", { p_lot: l.id }) : Promise.resolve({ data: [] }),
      l.status === "sold" ? supabase.rpc("seller_lot_collection", { p_lot: l.id }) : Promise.resolve({ data: [] }),
      supabase.rpc("lot_watchers", { p_lot: l.id }),
      HAS_BIDS.includes(l.status) && l.bid_count > 0 ? supabase.rpc("seller_lot_bids", { p_lot: l.id }) : Promise.resolve({ data: [] }),
      l.status === "sold" ? supabase.rpc("seller_lot_transfer", { p_lot: l.id }) : Promise.resolve({ data: [] }),
    ]);
    return { offers: (offers.data || []) as Offer[], coll: ((coll.data || []) as Coll[])[0] || null, watchers: Number(watchers.data || 0), bids: (bids.data || []) as Bid[], videos: ((vids || []) as Video[]).filter((v) => v.lot_id === l.id), transfer: ((tr.data || []) as Transfer[])[0] || null };
  }));
  const payoutFor = (id: number) => ((payouts || []) as Payout[]).find((p) => p.lot_id === id);

  return (
    <div className="wrap" style={{ maxWidth: 980, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 24 }}>
      <span className="eyebrow" style={{ color: "var(--grape)" }}>Selling</span>
      <h1 className="d2">Your vehicles.</h1>
      {all.length > 0 && (
        <nav className="seg" aria-label="Your listings" style={{ alignSelf: "flex-start" }}>
          {TABS.map(([k, label, st]) => <Link key={k} href={`/sell/dashboard?tab=${k}`} className={k === tab ? "on" : ""} aria-current={k === tab ? "page" : undefined} data-testid={`tab-${k}`}>{label} ({count(st)})</Link>)}
        </nav>
      )}
      {all.length > 0 && lots.length === 0 && <div className="empty"><b>No {TABS.find(([k]) => k === tab)![1].toLowerCase()} listings.</b></div>}
      {all.length === 0 && <div className="empty"><b style={{ fontSize: 22 }}>Nothing listed yet.</b><span className="muted">Request a free appraisal and we&apos;ll send you a link to set up your listing.</span><Link className="btn btn-blue" href="/sell">Sell a vehicle</Link></div>}
      {lots.map((l, i) => {
        const { offers, coll, watchers, bids, videos, transfer } = extra[i];
        const rules = rulesFor(transfer?.rego_state || l.rego_state || l.state);
        const p = payoutFor(l.id);
        const [label, colour] = STATUS[l.status] || [l.status, "var(--panel)"];
        const pending = offers.filter((o) => o.status === "pending");
        return (
          <div className="soft" key={l.id} style={{ background: "#FFFFFF", border: "1px solid var(--line)", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
              <Link href={`/lot/${l.id}`} style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>{l.title}</Link>
              <span className="tag" style={{ background: colour }}>{label}</span>
            </div>
            <div className="facts">
              <div className="fact"><span className="k">{l.status === "sold" ? "Sold for" : "Current bid"}</span><span className="v">{money(l.status === "sold" ? l.sold_price : l.current_bid)}</span></div>
              <div className="fact"><span className="k">Bids</span><span className="v">{l.bid_count}</span></div>
              <div className="fact"><span className="k">Watching</span><span className="v">{watchers}</span></div>
              <div className="fact"><span className="k">Views</span><span className="v">{(l.views || 0).toLocaleString("en-AU")}</span></div>
              <div className="fact"><span className="k">{l.status === "live" ? "Ends" : "Reserve"}</span><span className="v">{l.status === "live" ? dateTime(l.ends_at) : l.has_reserve ? (l.reserve_met ? "Met" : "Not met") : "None"}</span></div>
            </div>
            {l.status === "draft" && <span className="muted">We&apos;re checking your papers and preparing the listing. We&apos;ll text you when it goes live.</span>}
            {bids.length > 0 && (
              <details open={l.status === "live"}>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>Bids ({bids.length})</summary>
                <div className="bidlist" style={{ marginTop: 8 }}>
                  {bids.slice(0, 50).map((b, k) => (
                    <div key={k}><span><BlurName mask={b.bidder_mask} />{b.is_auto ? <span className="muted" style={{ fontSize: 13 }}> · auto</span> : null}</span><b>{money(b.amount)}</b><span className="muted" style={{ textAlign: "right", fontSize: 14 }}>{dateTime(b.created_at)}</span></div>
                  ))}
                </div>
                <span className="hint">Bidder names are hidden. Every bidder has verified their mobile, card and ID.</span>
              </details>
            )}
            {(VIDEO_OPEN_STATUSES.includes(l.status) || videos.length > 0) && <SellerVideos lotId={l.id} videos={videos} canAdd={VIDEO_OPEN_STATUSES.includes(l.status)} />}
            {l.status === "referred" && (
              <div className="notice" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <b>Bidding ended at {money(l.current_bid)}, below your reserve. Decide by {dateLong(l.decision_by)}.</b>
                <span>If you accept, it&apos;s sold and we take payment from the buyer now. If you decline (or don&apos;t answer in time), we open offers.</span>
                <SellerDecision lotId={l.id} kind="referral" amount={l.current_bid} />
              </div>
            )}
            {l.status === "offers" && (
              <div className="notice" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <b>Offers are open until {dateLong(l.decision_by)}.</b>
                {pending.length === 0 && <span className="muted">No offers yet. We&apos;ll text you as each one arrives.</span>}
                {pending.map((o) => <SellerDecision key={o.id} lotId={l.id} kind="offer" offerId={o.id} amount={o.amount} when={o.created_at} />)}
              </div>
            )}
            {l.status === "sold" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {!transfer && !coll && <span>We&apos;re taking payment from the buyer. We&apos;ll text you once it&apos;s paid.</span>}
                {transfer && transfer.status !== "complete" && (
                  <div className="notice" style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="seller-transfer">
                    <b>Paid in full. Next: transfer of ownership.</b>
                    {transfer.registration === "registered" && transfer.buyer_choice === "unregistered" ? (
                      <span>The buyer is taking it unregistered. Your consultant will call you about cancelling the registration with {rules.authority} (you may get a refund for the unused registration). Keep the plates.</span>
                    ) : transfer.registration === "registered" ? (<>
                      <span><b>Your part:</b> {rules.seller} <a className="blue" href={rules.sellerUrl} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>{rules.authority} ›</a></span>
                      {rules.cert && <span className="hint">{rules.cert}</span>}
                      {transfer.seller_done_at ? <span className="status-pill" style={{ background: "var(--mint)", alignSelf: "flex-start" }}>Done{transfer.seller_reference ? ` · ${transfer.seller_reference}` : ""}</span> : <SellerTransferDone lotId={l.id} />}
                      <span className="muted">{transfer.status === "submitted" ? "The buyer has sent their transfer. We're checking it." : "Then the buyer transfers it into their name. We'll text you when it's done."}</span>
                    </>) : (
                      <span>It&apos;s sold unregistered, so there&apos;s nothing for you to lodge. The buyer confirms their certificate of sale and how they&apos;ll move it.</span>
                    )}
                    <span className="hint">The buyer only gets your address once ownership is done and the collection time is confirmed.</span>
                  </div>
                )}
                {transfer?.status === "complete" && !coll && <span>Ownership transferred. We&apos;ll call you to confirm the buyer&apos;s collection time.</span>}
                {coll?.status === "requested" && <span>The buyer has asked to collect. We&apos;ll call you to confirm a time.</span>}
                {coll?.status === "confirmed" && (<>
                  <span>Collection: <b>{coll.confirmed_for}</b> by <b>{coll.collector}</b>.</span>
                  <span className="muted">Only hand over the keys when they give you the 6-digit release code. Never accept money from them directly.</span>
                  {coll.seller_token && <Link className="btn btn-blue" style={{ alignSelf: "flex-start", height: 46 }} href={`/handover/${coll.seller_token}`}>Open the handover page</Link>}
                </>)}
                {coll?.status === "collected" && <span className="notice ok">Collected {dateLong(coll.collected_at)}.</span>}
                {p && (
                  <span>Payout: <b>{money(p.net_amount, true)}</b> · {p.status === "paid" ? `paid ${dateLong(p.paid_at)}` : p.status === "ready" ? "being paid now" : p.status === "on_hold" ? `on hold (${p.hold_reason})` : "after collection and the buyer's claim window"}
                    {" "}· <a className="blue" href={`/api/payouts/${p.id}/pdf`} style={{ fontWeight: 700 }}>Settlement statement</a></span>
                )}
              </div>
            )}
          </div>
        );
      })}
      {all.length > 0 && <p className="hint"><a className="blue" href="/api/seller/report" data-testid="seller-report">Download a report of all your vehicles (CSV) ›</a></p>}
      <p className="hint">Questions? Call {env.phone}. <Link className="blue" href="/seller-agreement">Read the Seller Agency Agreement ›</Link></p>
    </div>
  );
}
