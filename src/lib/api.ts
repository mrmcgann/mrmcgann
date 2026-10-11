import { viewingError } from "@/lib/viewings";
import "server-only";
import { NextResponse } from "next/server";
import { money } from "@/lib/format";
import { reportLater } from "@/lib/errors";

export const json = (data: unknown, status = 200) => NextResponse.json(data, { status });
export const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

// Turns database errors from the bidding functions into plain-English messages.
export function friendly(message: string | undefined) {
  const m = message || "";
  if (m.includes("not_signed_in")) return "Sign in to continue.";
  const viewing = viewingError(m);
  if (viewing) return viewing;
  if (m.includes("account_suspended")) return "Your account can't bid at the moment. If you think that's a mistake, call us.";
  if (m.includes("not_verified")) return "Finish setting up your account (your details, mobile and ID) before you bid.";
  const short = depositShort(m);
  if (short) return short.have > 0
    ? `To bid this much you need ${money(short.need)} of bidding deposit free. You have ${money(short.have)} free, so add ${money(short.need - short.have)}.`
    : `To bid this much you need a ${money(short.need)} bidding deposit free. Your deposit is holding other vehicles you're winning, so add ${money(short.need)}.`;
  if (m.includes("withdraw_too_much")) {
    const n = Number(m.split("withdraw_too_much:")[1]);
    return n > 0 ? `You can withdraw up to ${money(n)} right now. The rest is holding vehicles you're winning.` : "Your whole deposit is holding vehicles you're winning. You can withdraw it once you're not winning anything.";
  }
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
  if (m.includes("referral_expired")) return "The time to accept this bid has passed, so offers are now open.";
  if (m.includes("status_locked")) return "This vehicle has already sold or closed, so it can't be put back on sale from here.";
  // Errors that carry their own plain-English message after the code ("code:message").
  for (const code of ["withdraw_unpaid", "not_pending", "note_needed", "not_relistable", "already_relisted", "not_passed", "no_cancelled_sale", "offer_open", "no_next_bidder", "below_reserve",
    "offer_closed", "offer_expired", "not_live", "too_soon", "bad_gap"]) {
    if (m.includes(`${code}:`)) { const t = m.split(`${code}:`)[1]?.split("\n")[0].trim(); return t ? t[0].toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".") : "That can't be done right now."; }
  }
  if (m.includes("offer_not_found")) return "We couldn't find that offer.";
  if (m.includes("member_not_found")) return "We couldn't find that member.";
  if (m.includes("no_bids")) return "That member hasn't bid on this vehicle.";
  if (m.includes("reason_required")) return "Give a reason. It's sent to the bidder and kept on record.";
  // Anything else wasn't expected (a database change not applied, a bug): record it for Admin → Site health.
  // Not the engine's own answers (codes like "media_limit" or "reserve_locked:…"), and not bad input someone typed or
  // sent (a word where a number goes): those are expected, not the site breaking.
  if (m && !/^[a-z][a-z_]+(:|$)/.test(m.trim()) && !/invalid input syntax|invalid input value|out of range|value too long|violates check constraint|malformed|JSON object requested, multiple \(or no\) rows|Results contain 0 rows/i.test(m)) {
    reportLater({ source: "server", name: "Unexpected database error", message: m });
  }
  return "Something went wrong. Please try again.";
}

/** "deposit_short:<needed>:<free>" from the engine: the bidding deposit doesn't cover this amount. */
export function depositShort(message?: string): { need: number; have: number } | null {
  const m = /deposit_short:(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)/.exec(message || "");
  return m ? { need: Number(m[1]), have: Number(m[2]) } : null;
}

/** An error from bidding, Buy Now or an offer. A deposit that's too small comes back as 402 with the amounts, so the
 *  page can offer a top-up instead of just an error. */
export function failBid(message: string) {
  const d = depositShort(message);
  if (d) return NextResponse.json({ error: friendly(message), code: "deposit_short", need: d.need, have: d.have, topUp: Math.max(0, Math.ceil(d.need - d.have)) }, { status: 402 });
  return fail(friendly(message), message.includes("terms_outdated") ? 409 : 400);
}
