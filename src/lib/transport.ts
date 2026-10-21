// Seeing a vehicle, the pickup and collection. Vehicles stay with their owners until they're sold and paid for: buyers
// never go to the seller's place, and never learn who the seller is. After payment our transport partner picks the
// vehicle up and takes it to a depot, where the buyer collects it with a release code. The rules are in the database
// (transport_jobs, admin_transport, collection_ready; migration 20261022000021); this file has the shared words.
// Pure: used by the website, the server and the phone app.
import { money } from "./format.ts";

export type TransportStatus = "to_book" | "booked" | "picked_up" | "at_depot" | "released" | "returned" | "cancelled";
export type PickupWindow = "morning" | "afternoon" | "day";

/** What the buyer sees (invoice_transport()). The depot's street address only once their collection time is confirmed. */
export type BuyerTransport = {
  status: TransportStatus; pickup_on: string | null; picked_up_at: string | null; at_depot_at: string | null; released_at: string | null;
  condition_ok: boolean | null; condition_note: string | null; buyer_decision: "proceed" | "cancel" | null; sale_cancelled: boolean;
  depot_name: string | null; depot_suburb: string | null; depot_state: string | null; depot_postcode: string | null; depot_hours: string | null; depot_address: string | null;
};
/** What the seller sees (seller_lot_transport()). Never the buyer. */
export type SellerTransport = { ref: string; status: TransportStatus; pickup_on: string | null; pickup_window: PickupWindow | null; picked_up_at: string | null; released_at: string | null };

export const PICKUP_WINDOWS: [PickupWindow, string][] = [["morning", "Morning (8am to 12pm)"], ["afternoon", "Afternoon (12pm to 5pm)"], ["day", "Any time (8am to 5pm)"]];
export const windowLabel = (w?: string | null) => PICKUP_WINDOWS.find(([k]) => k === w)?.[1] || "";

export const TRANSPORT_STATUS: Record<TransportStatus, string> = {
  to_book: "Pickup to book", booked: "Pickup booked", picked_up: "On its way to the depot", at_depot: "At the depot",
  released: "Collected", returned: "Back with the seller", cancelled: "Cancelled",
};

/** How buyers check a vehicle, in place of a viewing (the listing, the Help page and the app). [title, what it is] */
export const CHECK_IT: [string, string][] = [
  ["Our condition report", "We walk around it and inspect it visually where it's kept: photos of every side, the damage map, the dash with the ignition on, and whether it starts and drives. A guide, not a mechanical inspection."],
  ["The walkaround video", "The seller films a walkaround for us, and we check it before it goes on the listing."],
  ["A mechanical inspection", "Order one from our partner mechanic before you bid. They inspect it where it's kept and email you their report; you pay them for it. You don't attend, and the seller's details stay private."],
  ["Ask us anything", "Ask on the listing or call your consultant. We check with the seller and answer, so you never need to contact them."],
];
export const NO_VIEWINGS = "No viewings or test drives: vehicles stay with their owners until they're sold, and buyers never visit.";

/** "Eagle Farm, QLD" (the depot's suburb), for the listing. */
export const depotPlace = (d: { suburb?: string | null; state?: string | null } | null | undefined) =>
  d?.suburb ? `${d.suburb}${d.state ? `, ${d.state}` : ""}` : "";

/** The buyer's premium label: "Buyer's premium (10% + $250 transport to our depot)". */
export function premiumLabel(f: { premium_rate: number; transport?: number | null }): string {
  const pct = Math.round(Number(f.premium_rate || 0) * 1000) / 10;
  const t = Number(f.transport) || 0;
  return `Buyer's premium (${pct}%${t > 0 ? ` + ${money(t)} transport to our depot` : ""})`;
}

/** One line on collection for a listing. */
export function collectLine(lot: { suburb?: string | null; state?: string | null; registration?: string | null }, transport?: number | null): string {
  const place = depotPlace(lot);
  return `Collect it from our depot${place ? ` in ${place}` : ""} once it's paid for and the ${lot.registration === "unregistered" ? "certificate of sale is done" : "registration is in your name"}. ` +
    `We pick it up from the seller and take it there${Number(transport) > 0 ? `: the ${money(Number(transport))} transport is in the buyer's premium` : ""}.`;
}

/** Where it's up to, for the buyer's invoice. */
export function buyerTransportLine(t: Pick<BuyerTransport, "status" | "pickup_on" | "depot_suburb" | "depot_state" | "sale_cancelled">): string {
  const where = t.depot_suburb ? `our depot in ${t.depot_suburb}${t.depot_state ? `, ${t.depot_state}` : ""}` : "our depot";
  if (t.sale_cancelled) return "The sale has been cancelled.";
  switch (t.status) {
    case "to_book": return `We're booking our transport partner to pick it up and take it to ${where}.`;
    case "booked": return `Our transport partner is picking it up${t.pickup_on ? ` on ${shortDay(t.pickup_on)}` : ""} and taking it to ${where}.`;
    case "picked_up": return `Picked up: on its way to ${where}.`;
    case "at_depot": return `At ${where}.`;
    case "released": return "Collected.";
    default: return "";
  }
}

/** Where it's up to, for the seller's dashboard. */
export function sellerTransportLine(t: Pick<SellerTransport, "status" | "pickup_on" | "pickup_window" | "ref">): string {
  switch (t.status) {
    case "to_book": return "Our transport partner will call you to book a time to pick it up.";
    case "booked": return `Pickup${t.pickup_on ? ` on ${shortDay(t.pickup_on)}` : ""}${t.pickup_window ? `, ${windowLabel(t.pickup_window).toLowerCase()}` : ""}. The driver will quote booking reference ${t.ref}: only hand it over to them, with all the keys.`;
    case "picked_up": case "at_depot": return "Picked up. Thanks: that's everything from you. We pay you once the buyer has collected it and their claim window has closed.";
    case "released": return "The buyer has collected it from our depot.";
    case "returned": return "Returned to you.";
    default: return "";
  }
}

/** "Thu 23 Oct" for a date ("2026-10-23"). */
export const shortDay = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).replace(",", "");

/** What the bidder agrees to about seeing it and collecting it, in the as-is acknowledgement (after "sold as is, where is:"). */
export const ACK_CHECK = "I can't view it, the condition report is a guide only (I can order a mechanical inspection through Tyrebiter, at my cost, before I bid), and I collect it from Tyrebiter's depot";

/** Plain words for the database's refusals (null when it isn't one of them). */
export function transportError(m: string): string | null {
  if (m.includes("not_at_depot")) return "It isn't at our depot yet. We'll tell you as soon as it arrives, so you can book a time to collect it.";
  if (m.includes("change_not_answered")) return "First tell us whether you're going ahead after the change our driver noted (on your invoice).";
  if (m.includes("transport_locked")) return "The transport amount is part of the buyer's premium, so it can't change once bidding has opened.";
  if (m.includes("transport_depot")) return "Choose an active depot first.";
  if (m.includes("transport_day")) return "Pick a day from today, within the next 60 days.";
  if (m.includes("transport_note")) return "Add a note saying what's different (the buyer sees it), or the reason.";
  if (m.includes("transport_no_decision")) return "There's nothing to decide on this one.";
  if (m.includes("transport_not_found")) return "We couldn't find that pickup.";
  if (m.includes("transport_step:")) { const t = m.split("transport_step:")[1]?.split("\n")[0].trim() || ""; return t ? t[0].toUpperCase() + t.slice(1) + "." : "That step doesn't fit where it's up to."; }
  return null;
}
