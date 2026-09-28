import "server-only";
import { NextResponse } from "next/server";
import { money } from "@/lib/format";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Turns database errors from the bidding functions into plain-English messages.
export function friendly(message: string | undefined) {
  const m = message || "";
  if (m.includes("not_signed_in")) return "Sign in to continue.";
  if (m.includes("not_verified")) return "Finish verifying your account (mobile, card and ID) before you bid.";
  if (m.includes("auction_closed")) return "This auction has closed.";
  if (m.includes("max_not_higher")) return "You're already winning. Enter a higher amount to raise your maximum.";
  if (m.includes("too_low")) {
    const n = Number(m.split("too_low:")[1]);
    return n ? `Enter ${money(n)} or more.` : "Your bid is too low.";
  }
  if (m.includes("invalid_amount")) return "Enter a whole-dollar amount.";
  if (m.includes("buy_now_unavailable")) return "Buy Now is no longer available on this vehicle.";
  if (m.includes("offers_closed")) return "The offer period has closed.";
  if (m.includes("offer_not_higher")) {
    const n = Number(m.split("offer_not_higher:")[1]);
    return n ? `Offer more than your last offer of ${money(n)}.` : "Offer more than your last offer.";
  }
  if (m.includes("lot_not_found")) return "We couldn't find that vehicle.";
  if (m.includes("own_vehicle")) return "Sellers (and anyone using the seller's mobile number) can't bid on their own vehicle.";
  if (m.includes("terms_outdated")) return "Our terms have been updated. Please review and accept them to keep bidding.";
  if (m.includes("not_ready:")) return `Not ready to publish: ${m.split("not_ready:")[1]?.split("\n")[0]}.`;
  if (m.includes("invite_used")) return "This listing is already linked to another seller account.";
  if (m.includes("invite_not_found")) return "That seller link isn't valid. Ask us to send a new one.";
  if (m.includes("already_listed")) return "This vehicle is already listed, so the agreement can't be changed online. Call us.";
  if (m.includes("wrong_code")) return "That release code doesn't match. Check it with the collector.";
  if (m.includes("too_many_attempts")) return "Too many wrong codes. Call us before handing over the vehicle.";
  if (m.includes("not_confirmed")) return "This collection hasn't been confirmed yet.";
  if (m.includes("offer_not_pending")) return "That offer is no longer pending.";
  if (m.includes("not_referred")) return "This vehicle isn't waiting on a referral decision.";
  if (m.includes("forbidden")) return "You don't have permission to do that.";
  return "Something went wrong. Please try again.";
}
