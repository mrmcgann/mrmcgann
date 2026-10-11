// Bidding deposits: small shared helpers (website, server, app and tests; no Node or Next imports).
import type { DepositEntry, DepositSummary, Fees } from "./types.ts";
import { depositFor } from "./fees.ts";
import { money } from "./format.ts";

/** A payment reference as typed on a bank statement: capitals and digits only ("bid-k7m 2qx" → "BIDK7M2QX"). */
export const cleanRef = (s: string) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const words = (s: string) => String(s || "").toLowerCase().replace(/[^a-z\s'-]/g, " ").split(/[\s'-]+/).filter((w) => w.length > 1);

/** Does the name on the paying account look like the member? Statements show "SMITH J", "J SMITH", "MR JOHN SMITH",
 *  "JOHN & JANE SMITH", "SMITH JOHN PAUL"... so the surname must be there. */
export function payerMatches(payer: string, first?: string | null, last?: string | null): boolean {
  const p = new Set(words(payer));
  const l = words(last || "");
  if (!l.length || !p.size) return false;
  return l.every((w) => p.has(w)) || p.has(l[l.length - 1]);
}

/** Bid limits to choose from, with the deposit each needs. The last is "no limit" when there's a cap. */
export function limitChoices(f: Fees): { limit: number | null; deposit: number; label: string }[] {
  const cap = f.deposit_cap ?? 0, rate = f.deposit_rate ?? 0.1;
  const steps = [5000, 10000, 20000, 30000].filter((l) => !(cap > 0 && depositFor(l, f) >= cap));
  const out: { limit: number | null; deposit: number; label: string }[] = steps.map((l) => ({ limit: l, deposit: depositFor(l, f), label: `Up to $${l.toLocaleString("en-AU")}` }));
  if (cap > 0) out.push({ limit: null, deposit: cap, label: "No limit" });
  else out.push({ limit: 50000, deposit: depositFor(50000, f), label: `Up to $${(50000).toLocaleString("en-AU")}` });
  return rate > 0 ? out : [];
}

/** "You can bid up to $5,000", "You can bid any amount", or why you can't bid yet. */
export function limitLine(d: Pick<DepositSummary, "unlimited" | "limit" | "balance" | "min" | "available"> | null | undefined): string {
  if (!d) return "Add a bidding deposit to start bidding.";
  if (d.unlimited) return "You can bid any amount.";
  if ((d.limit || 0) > 0) return `You can bid up to $${Number(d.limit).toLocaleString("en-AU")}.`;
  if (d.balance > 0 && d.available <= 0) return "Your deposit is holding the vehicles you're winning.";
  return `Add a bidding deposit (from $${Number(d.min || 500).toLocaleString("en-AU")}) to start bidding.`;
}

/** How it works, in four steps (the deposit page, sign-up and the app all use these words). */
export const depositSteps = (f: Fees): [string, string][] => [
  ["Pay a deposit", `By PayID or bank transfer, from an account in your name. It's ${Math.round((f.deposit_rate ?? 0.1) * 100)}% of the most you want to bid${(f.deposit_cap ?? 0) > 0 ? `, and $${(f.deposit_cap as number).toLocaleString("en-AU")} lets you bid any amount` : ""}.`],
  ["Bid", "Your deposit covers every vehicle you're winning at once. Top up any time to bid more."],
  ["Win", "The deposit for the price goes towards it. Pay the rest by PayID or bank transfer within 2 business days."],
  ["Get it back", "Not winning anything? Withdraw your deposit whenever you like, back to the account it came from."],
];

/** One line of the deposit history, in words (website and app). */
export function depositWhat(e: DepositEntry): string {
  switch (e.kind) {
    case "received": return `Deposit received${e.method === "payid" ? " by PayID" : " by bank transfer"}`;
    case "applied": return e.invoice_status === "cancelled" && !e.cancel_reason?.startsWith("not_buyer_fault")
      ? `Kept: ${e.vehicle || e.invoice_ref} wasn't paid for` : `Towards ${e.vehicle || "your vehicle"} (${e.invoice_ref})`;
    case "returned": return `Back from ${e.vehicle || e.invoice_ref}: the sale was cancelled`;
    case "withdrawal": return e.status === "pending" ? "Refund on its way to you" : e.status === "cancelled" ? "Refund cancelled" : "Refunded to your account";
    default: return e.note || "Correction by our team";
  }
}

/** How much deposit is free for a bid on one vehicle (what's free, plus what this vehicle already holds if you're leading it). */
export function depositShortBy(amount: number, f: Fees, d: Pick<DepositSummary, "available"> | null | undefined, holdingHere = 0) {
  const need = depositFor(amount, f);
  const free = (d?.available || 0) + holdingHere;
  return { need, free, short: Math.max(0, Math.ceil(need - free)) };
}

type Preview = { payMode: "transfer" | "deposit" | "card"; balanceDue: number; cardBase: number; total: number };

/** How a win is paid for, in one sentence, for the bid confirm step (website and app). Null for the old card way. */
export function winPayLine(p: Preview, days = 2): string | null {
  if (p.payMode === "transfer") return `If you win, pay the ${money(p.total, true)} by PayID or bank transfer within ${days} business days (your lender can pay it if you're using finance). No deposit, no card, no surcharge.`;
  if (p.payMode === "deposit") return p.balanceDue > 0
    ? `If you win, ${money(p.cardBase, true)} of your bidding deposit goes towards it and you pay the ${money(p.balanceDue, true)} balance by PayID or bank transfer within ${days} business days. No card, no surcharge.`
    : `If you win, it's paid in full from your bidding deposit (${money(p.cardBase, true)}). No card, no surcharge.`;
  return null;
}

/** The same for Buy Now (the sale happens straight away). */
export function buyNowPayLine(p: Preview, days = 2): string | null {
  if (p.payMode === "transfer") return `Pay the ${money(p.total, true)} by PayID or bank transfer within ${days} business days. The bank details are on your invoice.`;
  if (p.payMode === "deposit") return p.balanceDue > 0
    ? `${money(p.cardBase, true)} of your bidding deposit goes towards it now. Pay the ${money(p.balanceDue, true)} balance by PayID or bank transfer within ${days} business days.`
    : `It's paid in full from your bidding deposit (${money(p.cardBase, true)}).`;
  return null;
}

/** What the bidder agrees to about paying, in the as-is acknowledgement. */
export function ackPayLine(mode: Preview["payMode"], days = 2): string {
  if (mode === "transfer") return `if I win, I'll pay the full amount by PayID or bank transfer within ${days} business days, and if I don't, the sale can be cancelled and my account closed`;
  if (mode === "deposit") return "if I win, the deposit for the price is applied straight away and I pay the balance on time (or lose that deposit and my account)";
  return "if I win I authorise payment from my card straight away";
}

/** The verification steps a member does, in the order they're done (step 4, payment, only when the pay mode needs it). */
export function joinSteps(mode: Preview["payMode"] | undefined): number[] {
  return mode === "deposit" || mode === "card" ? [1, 2, 3, 5, 4] : [1, 2, 3, 5];
}
