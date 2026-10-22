// Live auctions and tenders: shared words and small rules. The engine is in the database (place_bid_for,
// live_advance, admin_live_*, reveal_tenders, migration 20261021000020); this file only helps pages show it.
// Pure: website, server and phone app.
import { bidIncrement, money } from "./format.ts";

export type LiveStatus = "scheduled" | "running" | "paused" | "ended";
export type LiveSale = {
  id: number; slug: string; title: string; intro: string | null; state: string | null; seller_label: string | null;
  mode: "timed" | "live"; starts_at: string | null; stream_url: string | null; auctioneer: string | null;
  live_status: LiveStatus; current_lot_id: number | null; live_message: string | null; live_message_at: string | null;
  lot_seconds: number; extend_seconds: number;
};
export type LiveLot = {
  id: number; title: string; status: string; live_state: "waiting" | "open" | "closed" | null; sale_order: number | null;
  current_bid: number; start_price: number; bid_count: number; ends_at: string | null; reserve_met: boolean; has_reserve: boolean;
  leader_id: string | null; sold_price: number | null; cover_path: string | null; category: string; year: number | null;
  odometer: number | null; hours: number | null; suburb: string | null; state: string | null; fees?: Record<string, number | string> | null;
  estimate_low?: number | null; estimate_high?: number | null; statutory_warranty?: boolean | null;
};

/** How a vehicle is sold, in a few words. */
export function howSold(l: { method?: string | null; live_state?: string | null }): "tender" | "live" | "timed" {
  return l.method === "tender" ? "tender" : l.live_state ? "live" : "timed";
}
export const HOW_LABEL = { timed: "Timed auction", live: "Live auction", tender: "Tender" } as const;

/** The lowest bid the engine will take next (the same rule as place_bid). */
export const nextBid = (l: { current_bid: number; bid_count: number; start_price: number }) =>
  l.bid_count === 0 ? Math.max(Number(l.start_price) || 0, Number(l.current_bid) || 0, 1) : Number(l.current_bid) + bidIncrement(Number(l.current_bid));

/** Quick-bid buttons in the live room: the next bid and a couple of steps above it. */
export function quickBids(l: { current_bid: number; bid_count: number; start_price: number }, n = 3): number[] {
  const out = [nextBid(l)];
  while (out.length < n) { const last = out[out.length - 1]; out.push(last + bidIncrement(last)); }
  return out;
}

/** The auctioneer's calls, shown to everyone. "On the market" only once the reserve is met. */
export const CALLS: { text: string; needsReserve?: boolean }[] = [
  { text: "Any advance?" }, { text: "On the market", needsReserve: true }, { text: "Fair warning" }, { text: "Last call" }, { text: "Selling now" },
];

/** YouTube or Vimeo link (watch, live, short or share links) → the player address the site allows. Anything else: null. */
export function streamEmbed(raw: string | null | undefined): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const ok = (id: string | null | undefined) => (id && /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null);
  let yt: string | null = null;
  if (host === "youtu.be") yt = ok(u.pathname.slice(1).split("/")[0]);
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    yt = parts[0] === "watch" ? ok(u.searchParams.get("v")) : ["embed", "live", "shorts"].includes(parts[0]) ? ok(parts[1]) : null;
  }
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&mute=1&playsinline=1`;
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const parts = u.pathname.split("/").filter(Boolean);
    const id = ok(host === "vimeo.com" ? parts.find((p) => /^\d+$/.test(p)) : parts[0] === "video" ? parts[1] : null);
    if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}?autoplay=1&muted=1`;
  }
  return null;
}

/** Seconds left on the countdown, using the server's clock (offset = server time − this device's time). */
export const secondsLeft = (endsAt: string | null | undefined, offsetMs = 0, now = Date.now()) =>
  endsAt ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - (now + offsetMs)) / 1000)) : 0;

/** What the room shows under the price. */
export function liveLine(sale: Pick<LiveSale, "live_status">, lot: Pick<LiveLot, "live_state" | "status" | "reserve_met" | "has_reserve" | "sold_price" | "bid_count"> | null): string {
  if (sale.live_status === "scheduled") return "The sale hasn't started yet. You can bid early on any vehicle.";
  if (sale.live_status === "ended") return "The sale has finished.";
  if (!lot) return "Next vehicle coming up.";
  if (lot.live_state === "open" && lot.status === "live") {
    if (sale.live_status === "paused") return "Paused. Bidding resumes in a moment.";
    return lot.bid_count === 0 ? "Open for bids." : !lot.has_reserve || lot.reserve_met ? "Reserve met: it's on the market." : "Bidding, reserve not met yet.";
  }
  return resultLine(lot);
}
/** A closed vehicle's result, in words (the price only when it sold). */
export function resultLine(lot: Pick<LiveLot, "status" | "sold_price">): string {
  if (lot.status === "sold") return `Sold${lot.sold_price ? ` for ${money(Number(lot.sold_price))}` : ""}.`;
  if (lot.status === "referred") return "Highest bid referred to the seller.";
  if (lot.status === "offers") return "Passed in: open to offers.";
  if (lot.status === "passed") return "Passed in.";
  return "Coming up.";
}

/** Tender wording. */
export const TENDER_STEPS = [
  "Put in the most you'll pay. Nobody else sees your amount: the listing shows only how many tenders are in.",
  "Change it or take it back any time until the tender closes.",
  "When it closes, the highest tender buys at that price (the earliest wins a tie), as long as it meets the seller's reserve. If it doesn't, we take it to the seller.",
];

/** Plain words for the engine's live and tender refusals (null when it isn't one of them). */
export function liveError(m: string): string | null {
  if (m.includes("live_paused")) return "The auctioneer has paused bidding for a moment. Try again when it's back.";
  if (m.includes("tender_online_only")) return "Tenders are put in online by the buyer.";
  if (m.includes("no_tender")) return "You don't have a tender on this vehicle.";
  if (m.includes("not_a_tender")) return "This vehicle isn't sold by tender.";
  if (m.includes("sale_not_running")) return "The sale isn't running.";
  if (m.includes("no_open_lot")) return "No vehicle is up right now.";
  if (m.includes("not_live_sale")) return "That isn't a live auction.";
  if (m.includes("sale_not_found")) return "We couldn't find that sale.";
  if (m.includes("bad_seconds")) return "Add between 5 seconds and 5 minutes.";
  for (const code of ["sale_move_bids", "method_locked", "sale_mode_locked", "sale_running", "sale_ended", "sale_hidden", "sale_started", "sale_not_started", "live_lot_open", "lot_not_waiting", "bidder_not_found",
    "live_only", "corrected_recently", "auctioneer_needed", "reserve_rule", "estimate_rule", "withdraw_closed"]) {
    if (m.includes(`${code}:`)) { const t = m.split(`${code}:`)[1]?.split("\n")[0].trim() || ""; return t ? t[0].toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".") : null; }
  }
  return null;
}
