// The auction estimate: the range we expect the hammer to fall in, like Turners' "estimated auction value". Every
// listing has one, with the all-in amounts beside it (the premium, transport, GST and admin fee added), shown as
// prominently as the estimate itself (Australian Consumer Law s 48).
//
// The database keeps the rules (lots_estimate_range and the estimate_rule triggers, migration 20261022000022): whole
// dollars, the high end no more than 25% above the low end (or $1,000 for cheaper vehicles), and the seller's reserve
// never above the low end. A statement about the future needs reasonable grounds (ACL s 4), so staff write down what
// each estimate is based on (lot_private.estimate_basis, never shown). Pure: website, server and phone app.
import { money } from "./format.ts";
import { priceBreakdown } from "./fees.ts";
import type { Fees } from "./types.ts";

export const ESTIMATE_SPREAD = 1.25;
export const ESTIMATE_MIN_GAP = 1000;
/** The fewest characters the written basis can have (the publish check's rule). */
export const ESTIMATE_BASIS_MIN = 20;

type WithEstimate = { estimate_low?: number | string | null; estimate_high?: number | string | null };

export const hasEstimate = (l: WithEstimate | null | undefined) => !!l && Number(l.estimate_low) > 0 && Number(l.estimate_high) > 0;

/** The highest the high end can be for a low end. */
export const estimateMaxHigh = (low: number) => Math.max(Math.floor(low * ESTIMATE_SPREAD), low + ESTIMATE_MIN_GAP);

/** What's wrong with an estimate, in words staff can act on (null when it's fine). */
export function estimateProblem(low: number | null | undefined, high: number | null | undefined, reserve?: number | null): string | null {
  const lo = Number(low), hi = Number(high);
  if (!low && !high) return "Add the auction estimate (low and high).";
  if (!(lo > 0) || !(hi > 0)) return "Enter both ends of the estimate.";
  if (lo !== Math.round(lo) || hi !== Math.round(hi)) return "Use whole dollars.";
  if (hi < lo) return "The high end must be at least the low end.";
  if (hi > Math.max(lo * ESTIMATE_SPREAD, lo + ESTIMATE_MIN_GAP)) return `Too wide: with a low end of ${money(lo)}, the high end can be up to ${money(estimateMaxHigh(lo))}.`;
  if (reserve != null && Number(reserve) > lo) return `The seller's reserve (${money(Number(reserve))}) is above the low end. Agree a lower reserve first.`;
  return null;
}

/** "$14,000–$17,000" */
export const estimateText = (l: WithEstimate) => (hasEstimate(l) ? `${money(Number(l.estimate_low))}–${money(Number(l.estimate_high))}` : "");

/** The all-in amounts at each end of the estimate (what you'd pay if the hammer fell there). */
export function estimateAllIn(l: WithEstimate, fees: Fees): [number, number] | null {
  if (!hasEstimate(l)) return null;
  return [priceBreakdown(Number(l.estimate_low), fees).total, priceBreakdown(Number(l.estimate_high), fees).total];
}
/** An all-in amount: whole dollars when it is one, otherwise to the cent (never rounded down). */
export const allInMoney = (n: number) => money(n, Math.round(n * 100) % 100 !== 0);
export const estimateAllInText = (l: WithEstimate, fees: Fees) => {
  const a = estimateAllIn(l, fees);
  return a ? `${allInMoney(a[0])}–${allInMoney(a[1])}` : "";
};

/** Under every estimate: what it is and isn't. */
export const ESTIMATE_NOTE =
  "Our estimate of where the hammer will fall, from recent sales of similar vehicles and what the seller has shown and told us. It's a guide, not a valuation or a promise: it may sell for more or less. The seller's reserve is never above the low end.";
