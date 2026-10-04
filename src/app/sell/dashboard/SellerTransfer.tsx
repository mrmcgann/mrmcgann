"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// The seller confirms they've lodged their part of the registration transfer.
export function SellerTransferDone({ lotId }: { lotId: number }) {
  const router = useRouter();
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function done() {
    setBusy(true); setErr("");
    const r = await fetch("/api/transfers/seller", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, reference: ref }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(d.error || "Couldn't save that.");
    router.refresh();
  }
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
      <label className="field" style={{ flex: "1 1 200px" }}><span>Receipt or reference number (optional)</span><input className="input" style={{ height: 46 }} value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} /></label>
      <button className="btn btn-dark" style={{ height: 46 }} disabled={busy} onClick={done} data-testid="seller-transfer-done">{busy ? "Saving…" : "I've done this"}</button>
      {err && <span className="notice bad" role="alert" style={{ width: "100%" }}>{err}</span>}
    </div>
  );
}
