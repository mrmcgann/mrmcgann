"use client";
import Link from "next/link";
import { depositFor, payMode } from "@/lib/fees";
import { money } from "@/lib/format";
import type { DepositSummary, Fees } from "@/lib/types";

/** Under a bid box: the bidder's limit, or (when they've typed more than it) exactly how much to add. */
export function DepositNeed({ fees, deposit, amount, holdingHere, lotId, signedIn }: {
  fees: Fees; deposit: DepositSummary | null; amount: number; holdingHere: number; lotId: number; signedIn: boolean;
}) {
  if (payMode(fees) !== "deposit" || !signedIn || !deposit || deposit.balance <= 0) return null;
  const free = deposit.available + holdingHere;
  const need = depositFor(amount, fees);
  const short = Math.ceil(need - free);
  const href = `/account/deposit?bid=${amount}&lot=${lotId}`;
  if (amount > 0 && short > 0) {
    return (
      <div className="depneed" role="status" data-testid="deposit-need">
        <span>To bid {money(amount)} you need {money(need)} of bidding deposit free. You have {money(Math.max(0, free))}.</span>
        <Link className="btn btn-dark" href={href} style={{ height: 42, fontSize: 14, padding: "0 16px" }}>Add {money(short)}</Link>
      </div>
    );
  }
  const limit = deposit.unlimited ? null : Math.floor(free / (deposit.rate || 0.1));
  return (
    <span className="hint" data-testid="deposit-limit">
      {deposit.unlimited || (deposit.cap > 0 && free >= deposit.cap) ? "Your deposit covers any amount." : `Your bid limit here: ${money(limit || 0)}.`} <Link className="blue" href={href}>Raise it ›</Link>
    </span>
  );
}

/** The engine said the deposit doesn't cover it (402 from /api/bid, /api/buy-now, /api/offer). */
export function DepositShort({ need, have, amount, lotId }: { need: number; have: number; amount: number; lotId: number }) {
  const add = Math.max(0, Math.ceil(need - have));
  return (
    <div className="depneed bad" role="alert" data-testid="deposit-short">
      <span><b>Top up to bid {money(amount)}.</b> It needs {money(need)} of bidding deposit free{have > 0 ? ` and you have ${money(have)} free` : ""}.</span>
      <Link className="btn btn-dark" href={`/account/deposit?bid=${amount}&lot=${lotId}`} style={{ height: 42, fontSize: 14, padding: "0 16px" }}>Add {money(add)}</Link>
    </div>
  );
}
