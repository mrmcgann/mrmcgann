"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { money, dateTime } from "@/lib/format";
import { sellerAfterIntro, type SellerAfterView } from "@/lib/afterAuction";

export type { SellerAfterView };

// Selling it now, after the auction (migration 26): the seller agrees a price in writing here (the highest bid, or the
// lowest they'd take), and their consultant offers it to a buyer at that price or more. They can change their mind
// until a buyer signs. Buyers are never named.
export function SellerAfter({ lotId, view }: { lotId: number; view: SellerAfterView }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const o = view.offer;
  const signed = o?.status === "cooling_off";
  const waiting = o?.status === "pending" && new Date(o.expires_at).getTime() > Date.now();
  const nobody = view.interested === 0 && view.price == null;

  async function send(action: "accept" | "withdraw", value?: number) {
    if (action === "accept" && !(Number(value) >= 1)) return setErr("Enter the lowest price you'd take, in dollars.");
    if (action === "accept" && !confirm(`Sell it for ${money(Number(value))} or more? We'll offer it to a buyer at that price.`)) return;
    if (action === "withdraw" && !confirm("Change your mind? Any offer still waiting for an answer is withdrawn.")) return;
    setBusy(true); setErr("");
    const res = await fetch("/api/seller/after", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, action, amount: value }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(d.error || "Couldn't do that. Please try again.");
    setAmount("");
    router.refresh();
  }

  return (
    <div className="notice" style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="seller-after">
      <b>Sell it now, before the next auction.</b>
      {signed && o && <span data-testid="seller-after-signed">A buyer has signed to buy it for {money(o.amount)}. The law gives them until {dateTime(o.cooling_off_until)} (Brisbane time) to change their mind, so it isn&apos;t final yet. We&apos;ll text you as soon as it is.</span>}
      {!signed && waiting && o && <span data-testid="seller-after-offered">We&apos;ve offered it to a buyer for {money(o.amount)}, open until {dateTime(o.expires_at)} (Brisbane time).</span>}
      {!signed && view.price != null && (
        <span data-testid="seller-after-price">You&apos;ll sell it for {money(view.price)} or more ({view.price_via === "admin" ? "you told your consultant" : "from this dashboard"}, {dateTime(view.price_at)}). Your consultant offers it to a buyer at that price; if nobody takes it, it goes into the next auction.</span>
      )}
      {!signed && view.open && (
        <>
          {view.price == null && <span data-testid="seller-after-intro">{sellerAfterIntro(view)}</span>}
          {!nobody && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              {view.highest != null && view.price == null && (
                <button className="btn btn-blue" disabled={busy} onClick={() => send("accept", Number(view.highest))} data-testid="seller-after-accept">{busy ? "…" : `Accept the highest ${view.not_offered ? "early " : ""}bid: ${money(view.highest)}`}</button>
              )}
              <input className="input" inputMode="numeric" placeholder={view.price != null ? "A different price ($)" : view.highest != null ? "Or the lowest price you'd take ($)" : "The lowest price you'd take ($)"} value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} style={{ maxWidth: 260 }} data-testid="seller-after-amount" aria-label="The lowest price you'd take, in dollars" />
              <button className="btn btn-soft" disabled={busy || !amount} onClick={() => send("accept", Number(amount))} data-testid="seller-after-name">Tell my consultant</button>
            </div>
          )}
        </>
      )}
      {!signed && view.price != null && <button className="btn btn-soft" disabled={busy} onClick={() => send("withdraw")} style={{ alignSelf: "flex-start" }} data-testid="seller-after-withdraw">I&apos;ve changed my mind</button>}
      {err && <div className="notice bad" role="alert">{err}</div>}
    </div>
  );
}
