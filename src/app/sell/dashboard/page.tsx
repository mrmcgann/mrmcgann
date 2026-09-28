import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import type { Lot } from "@/lib/types";
import { money, dateLong, dateTime } from "@/lib/format";
import { env } from "@/lib/env";
import { SellerDecision } from "./SellerDecision";

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

// The seller's own view: live bids, watchers, decisions, collection and payout.
export default async function SellerDashboard() {
  const { supabase, user } = await getSession();
  if (!user) redirect("/signin?next=/sell/dashboard");
  const { data: rows } = await supabase.from("lots").select("*").eq("seller_id", user.id).order("created_at", { ascending: false }).limit(50);
  const lots = (rows || []) as Lot[];
  const { data: payouts } = await supabase.from("seller_payouts").select("id, lot_id, status, net_amount, hold_reason, paid_at").eq("seller_id", user.id);
  const extra = await Promise.all(lots.map(async (l) => {
    const [offers, coll, watchers] = await Promise.all([
      ["referred", "offers"].includes(l.status) ? supabase.rpc("seller_lot_offers", { p_lot: l.id }) : Promise.resolve({ data: [] }),
      l.status === "sold" ? supabase.rpc("seller_lot_collection", { p_lot: l.id }) : Promise.resolve({ data: [] }),
      supabase.rpc("lot_watchers", { p_lot: l.id }),
    ]);
    return { offers: (offers.data || []) as Offer[], coll: ((coll.data || []) as Coll[])[0] || null, watchers: Number(watchers.data || 0) };
  }));
  const payoutFor = (id: number) => ((payouts || []) as Payout[]).find((p) => p.lot_id === id);

  return (
    <div className="wrap" style={{ maxWidth: 980, padding: "clamp(40px,6vw,72px) 16px", display: "flex", flexDirection: "column", gap: 24 }}>
      <span className="eyebrow" style={{ color: "var(--grape)" }}>Selling</span>
      <h1 className="d2">Your vehicles.</h1>
      {lots.length === 0 && <div className="empty"><b style={{ fontSize: 22 }}>Nothing listed yet.</b><span className="muted">Request a free appraisal and we&apos;ll send you a link to set up your listing.</span><Link className="btn btn-blue" href="/sell">Sell a vehicle</Link></div>}
      {lots.map((l, i) => {
        const { offers, coll, watchers } = extra[i];
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
                {!coll && <span>We&apos;re taking payment from the buyer. We&apos;ll text you once they book a collection time.</span>}
                {coll?.status === "requested" && <span>The buyer has asked to collect. We&apos;ll call you to confirm a time.</span>}
                {coll?.status === "confirmed" && (<>
                  <span>Collection: <b>{coll.confirmed_for}</b> by <b>{coll.collector}</b>.</span>
                  <span className="muted">Only hand over the keys when they give you the 6-digit release code. Never accept money from them directly.</span>
                  {coll.seller_token && <Link className="btn btn-blue" style={{ alignSelf: "flex-start", height: 46 }} href={`/handover/${coll.seller_token}`}>Open the handover page</Link>}
                </>)}
                {coll?.status === "collected" && <span className="notice ok">Collected {dateLong(coll.collected_at)}. Remember to lodge your notice of disposal with your state&apos;s transport authority.</span>}
                {p && (
                  <span>Payout: <b>{money(p.net_amount, true)}</b> · {p.status === "paid" ? `paid ${dateLong(p.paid_at)}` : p.status === "ready" ? "being paid now" : p.status === "on_hold" ? `on hold (${p.hold_reason})` : "after collection and the buyer's claim window"}
                    {" "}· <a className="blue" href={`/api/payouts/${p.id}/pdf`} style={{ fontWeight: 700 }}>Settlement statement</a></span>
                )}
              </div>
            )}
          </div>
        );
      })}
      <p className="hint">Questions? Call {env.phone}. <Link className="blue" href="/seller-agreement">Read the Seller Agency Agreement ›</Link></p>
    </div>
  );
}
