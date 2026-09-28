"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { money, dateTime } from "@/lib/format";

export function SellerDecision({ lotId, kind, offerId, amount, when }: { lotId: number; kind: "referral" | "offer"; offerId?: string; amount: number; when?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function act(accept: boolean) {
    const verb = accept ? "Accept" : "Decline";
    if (!confirm(`${verb} ${money(amount)}? ${accept ? "This is binding: the vehicle is sold at this price." : ""}`)) return;
    setBusy(true); setErr("");
    const action = `${accept ? "accept" : "decline"}_${kind}`;
    const res = await fetch("/api/seller/decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, action, offerId }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setErr(data.error); return; }
    router.refresh();
  }
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      {kind === "offer" && <span><b>{money(amount)}</b>{when ? <span className="muted"> · {dateTime(when)}</span> : null}</span>}
      <button className="btn btn-blue" style={{ height: 42, fontSize: 14 }} disabled={busy} onClick={() => act(true)}>Accept{kind === "referral" ? ` ${money(amount)}` : ""}</button>
      <button className="btn btn-soft" style={{ height: 42, fontSize: 14 }} disabled={busy} onClick={() => act(false)}>Decline</button>
      {err && <span className="errmsg">{err}</span>}
    </div>
  );
}
