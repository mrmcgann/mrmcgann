"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";

// The seller's reserve while their vehicle waits for the auction or is up: they can lower it, sell at the current bid,
// or remove it, until the hammer falls. It can never go up. Each change is recorded as their instruction.
export function SellerReserve({ lotId, currentBid, bidCount, upNow }: { lotId: number; currentBid: number; bidCount: number; upNow: boolean }) {
  const router = useRouter();
  const [reserve, setReserve] = useState<number | null | undefined>(undefined);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  useEffect(() => {
    fetch(`/api/seller/reserve?lot=${lotId}`).then((r) => r.json()).then((d) => setReserve(d?.reserve == null ? null : Number(d.reserve))).catch(() => setReserve(null));
  }, [lotId]);
  if (reserve === undefined || reserve === null) return null;
  async function change(to: number | null, words: string) {
    if (!confirm(words)) return;
    setBusy(true); setMsg(null);
    const res = await fetch("/api/seller/reserve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, reserve: to }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ kind: "bad", text: data.error || "Couldn't change the reserve." }); return; }
    setReserve(to); setAmount("");
    setMsg({ kind: "ok", text: to == null ? "Reserve removed: it sells to the highest bid." : data.reserve_met ? `Reserve lowered to ${money(to)}. The bidding has reached it, so it sells under the hammer.` : `Reserve lowered to ${money(to)}.` });
    router.refresh();
  }
  const typed = Math.round(Number(amount.replace(/[^0-9]/g, ""))) || 0;
  const canSellNow = bidCount > 0 && currentBid > 0 && currentBid < reserve;
  return (
    <div className="notice" style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="seller-reserve">
      <b>Your reserve: {money(reserve)}{currentBid >= reserve ? " (met)" : ""}</b>
      <span>{upNow ? "It's up in the live auction now. " : ""}You can lower it, or remove it, until the hammer falls, and it then sells to the highest bid that reaches it. It can only go down here (before anyone has bid, we can raise it for you, never above the low estimate). You can also call us during the auction and the auctioneer will record it for you.</span>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span className="moneyin" style={{ height: 46, fontSize: 18, background: "#FFFFFF", maxWidth: 200 }}><span className="muted">$</span><input inputMode="numeric" aria-label="New reserve" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="New reserve" style={{ fontSize: 18 }} /></span>
        <button className="btn btn-dark" style={{ height: 46, fontSize: 15 }} disabled={busy || !(typed > 0 && typed < reserve)} onClick={() => change(typed, `Lower your reserve to ${money(typed)}? This is your instruction to us: it can't be raised again.`)}>Lower my reserve</button>
        {canSellNow && <button className="btn btn-blue" style={{ height: 46, fontSize: 15 }} disabled={busy} onClick={() => change(currentBid, `Sell at the current bid of ${money(currentBid)}? Your reserve becomes ${money(currentBid)}, so it sells under the hammer to the highest bid at or above it.`)} data-testid="sell-at-bid">Sell at {money(currentBid)}</button>}
        <button className="btn btn-soft" style={{ height: 46, fontSize: 15, background: "#FFFFFF" }} disabled={busy} onClick={() => change(null, "Remove your reserve? It then sells to the highest bid, whatever it is.")}>Remove my reserve</button>
      </div>
      {msg && <span className={`notice ${msg.kind}`} role="status">{msg.text}</span>}
    </div>
  );
}
