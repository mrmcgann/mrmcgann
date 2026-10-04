"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function OfferAnswer({ id }: { id: string }) {
  const router = useRouter();
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function answer(accept: boolean) {
    if (accept && !ack) return setErr("Tick the box to confirm.");
    if (!accept && !confirm("Decline this offer? It goes to the next bidder.")) return;
    setBusy(true); setErr("");
    const res = await fetch("/api/second-chance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, accept }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(d.error || "Couldn't do that. Please try again.");
    if (d.invoiceId) router.push(`/account/invoices/${d.invoiceId}`); else router.refresh();
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 15, lineHeight: 1.5 }}>
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ width: 20, height: 20, flexShrink: 0 }} />
        <span>I want to buy it at this price, as is, where is, and I authorise payment from my card straight away under the <Link className="blue" href="/terms" target="_blank">terms of sale</Link>.</span>
      </label>
      {err && <div className="notice bad" role="alert">{err}</div>}
      <button className="btn btn-blue" disabled={busy} onClick={() => answer(true)} data-testid="offer-accept">{busy ? "…" : "Accept and buy"}</button>
      <button className="btn btn-soft" disabled={busy} onClick={() => answer(false)}>No thanks</button>
    </div>
  );
}
