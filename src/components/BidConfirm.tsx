"use client";
import { useState } from "react";
import Link from "next/link";
import type { Fees, Lot } from "@/lib/types";
import { priceBreakdown } from "@/lib/fees";
import { money } from "@/lib/format";
import { Modal } from "@/components/Modal";
import { rightsLine } from "@/lib/listing";

/** How the winner pays, in one sentence (card in full, or a deposit then a bank transfer). */
export function payNoteFor(preview: ReturnType<typeof priceBreakdown>, cardLabel: string | null) {
  return preview.mode === "card"
    ? `Charged in full to ${cardLabel || "your card"} as soon as the auction ends.`
    : `A ${money(preview.cardBase)} deposit (you lose it only if you don't pay) is charged to ${cardLabel || "your card"} as soon as the auction ends. Pay the ${money(preview.balanceDue, true)} balance by bank transfer within 2 business days.`;
}

/** A maximum this far above the next bid needs a second tick (fat-finger guard). */
export const isBigJump = (typed: number, minNext: number) => typed >= 50_000 || (typed > minNext * 2 && typed - minNext >= 2_000);

// The confirm step for a bid, shared by the vehicle page and the watchlist: the all-in price at the full maximum,
// how payment works, the as-is acknowledgement and the consumer-rights line. Nothing is placed until it's confirmed.
export function BidConfirm({ lot, typed, minNext, fees, cardLabel, busy, onPlace, onClose, changeLabel = "Change amount" }: {
  lot: Pick<Lot, "title" | "seller_type">; typed: number; minNext: number; fees: Fees; cardLabel: string | null; busy: boolean;
  onPlace: () => void; onClose: () => void; changeLabel?: string;
}) {
  const [sure, setSure] = useState(false);
  const [ack, setAck] = useState(false);
  const preview = priceBreakdown(typed, fees);
  const bigJump = isBigJump(typed, minNext);
  return (
    <Modal title={`Confirm your maximum: ${money(typed)}`} onClose={onClose}>
      <p className="muted" style={{ fontSize: 16 }}>{lot.title}. We&apos;ll bid for you, one increment at a time, only as far as needed to keep you in front, up to {money(typed)}. <b>Bids can&apos;t be withdrawn.</b></p>
      <div className="allin" style={{ border: 0, padding: 0 }}>
        <div><span className="muted">If you win at your full maximum</span><span>{money(preview.price)}</span></div>
        <div><span className="muted">Premium, GST and admin fee</span><span>{money(preview.subtotal - preview.price, true)}</span></div>
        <div className="tot"><span>All-in, at most</span><span>{money(preview.total, true)}</span></div>
      </div>
      <p style={{ fontSize: 14, lineHeight: 1.5 }}>{payNoteFor(preview, cardLabel)}</p>
      {bigJump && (
        <label className="notice bad" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} style={{ width: 20, height: 20, flexShrink: 0 }} />
          <span>That&apos;s {typed >= minNext * 2 ? `${Math.floor(typed / Math.max(1, minNext))}×` : "well above"} the next bid of {money(minNext)}. Tick to confirm {money(typed)} is right.</span>
        </label>
      )}
      <label style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 14, lineHeight: 1.5, padding: "14px 16px", borderRadius: 16, background: "var(--panel)" }}>
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ width: 20, height: 20, margin: "1px 0 0", flexShrink: 0, accentColor: "#2F5BFF" }} />
        <span>I understand this vehicle is sold <b>as is, where is</b>, at the seller&apos;s location, the condition report is a guide only, and if I win I authorise payment from my card straight away under the <Link className="blue" href="/terms" style={{ fontWeight: 700 }} target="_blank">terms of sale</Link>.</span>
      </label>
      <p className="hint" style={{ margin: 0 }} data-testid="rights-auction">{rightsLine("auction", lot.seller_type)}. <Link className="blue" href="/terms#t-asis" target="_blank">What that means ›</Link></p>
      <button className="btn btn-blue" onClick={onPlace} disabled={busy || !ack || (bigJump && !sure)}>{busy ? "Placing bid…" : `Place bid of up to ${money(typed)}`}</button>
      <button className="btn btn-soft" onClick={onClose}>{changeLabel}</button>
    </Modal>
  );
}
