// Relisting a vehicle that didn't sell (migration 25): it goes into the next live auction for its state, inside the
// seller's 90-day authority, with the state's own rules checked against the new auction's date. Pure, shared by the
// website and the app. The database does the relisting (relist_auto) and enforces the rules (lot_publish_check).
import { certNeeded } from "./transfer.ts";
import { dateTime, money } from "./format.ts";

/** The seller agreement is the written authority to sell, for 90 days from signing (seller agreement s 1). */
export const AUTHORITY_DAYS = 90;

export function authorityEnds(signedAt: string | Date | null | undefined): Date | null {
  if (!signedAt) return null;
  const t = new Date(signedAt).getTime();
  return Number.isFinite(t) ? new Date(t + AUTHORITY_DAYS * 86_400_000) : null;
}

/** "21 Jan 2027" (Brisbane time). */
const fullDay = (d: Date | string) => new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Brisbane" });

export type RelistFacts = {
  state?: string | null; regoState?: string | null; registration?: string | null; year?: number | null; category?: string | null; gvm?: number | null;
  /** the live auction the relist is in, if any */
  saleTitle?: string | null; saleAt?: string | null;
  /** when the seller signed the agreement the relist carries */
  signedAt?: string | null;
  /** where bidding stopped last time (null when nobody bid) */
  passedAt?: number | null;
  /** the auction finished before it was offered last time */
  notOffered?: boolean;
};
export type RelistStep = { text: string; warn?: boolean };

/** What staff do before a relisted vehicle can go live, with its state's rule for the new auction's date. */
export function relistSteps(f: RelistFacts, now = new Date()): RelistStep[] {
  const steps: RelistStep[] = [];
  steps.push(f.saleTitle && f.saleAt
    ? { text: `It goes into ${f.saleTitle} on ${dateTime(f.saleAt)}. Choose a different live auction in the editor if that doesn't suit.` }
    : { text: "Choose the live auction it goes into (in the editor).", warn: true });
  steps.push({ text: "Agree the reserve with the seller. They can lower it, and it has to sit at or below the new estimate's low end." });
  steps.push({ text: `Set a fresh estimate and write down its grounds${f.notOffered ? " (it wasn't offered last time)" : f.passedAt ? `: bidding stopped at ${money(f.passedAt)} last time` : ": nobody bid last time"}.` });
  steps.push({ text: "Run a fresh PPSR search, and tick the listing checks again against the seller's photos, video and records." });
  const st = String(f.regoState || f.state || "").toUpperCase();
  const cert = f.registration === "registered" ? certNeeded(st, f.year, f.category, f.gvm, now) : null;
  const at = f.saleAt ? ` (${fullDay(f.saleAt)})` : "";
  if (cert === "roadworthy certificate") steps.push({ text: `Victoria: the roadworthy certificate must be issued less than 30 days before the auction${at}, so the seller may need a new one.` });
  else if (cert === "safety certificate") steps.push({ text: `Queensland: the safety certificate must be no more than 2 months old at the auction${at}, so the seller may need a new one.` });
  else if (cert) steps.push({ text: `${st}: it needs a current ${cert} before the registration can be transferred.` });
  const ends = authorityEnds(f.signedAt);
  if (!ends) steps.push({ text: "There's no signed agreement on this listing: send the seller the agreement link.", warn: true });
  else {
    const late = f.saleAt ? new Date(f.saleAt).getTime() >= ends.getTime() : ends.getTime() <= now.getTime();
    steps.push({ text: `The seller's authority to sell ends on ${fullDay(ends)} (90 days after they signed).${late ? " That's before the auction: ask them to sign the agreement again." : " The auction must be before then."}`, warn: late });
  }
  return steps;
}

/** What the seller is told about the next auction (the dashboard, in step with relist_seller_text in the database). */
export function relistSellerLine(saleAt?: string | null): string {
  return saleAt
    ? `We're offering it again in our live auction on ${dateTime(saleAt)} (Brisbane time).`
    : "We're offering it again at our next live auction, and we'll tell you the date.";
}

/** The listing of a vehicle that was passed in, once it's back in an auction. */
export function relistBackLine(saleAt?: string | null): string {
  return saleAt ? `It's back, in our live auction on ${dateTime(saleAt)} (Brisbane time).` : "It's back for auction.";
}
