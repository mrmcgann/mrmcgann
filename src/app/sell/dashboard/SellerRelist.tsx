"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// A vehicle that didn't sell goes into the next live auction unless the seller says no. Saying no is free until it's
// listed (seller agreement, section 12); the vehicle stays theirs.
export function SellerRelist({ lotId }: { lotId: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function decline() {
    if (!confirm("Keep it out of the next auction? It stays yours, and there's no fee.")) return;
    setBusy(true); setErr("");
    const res = await fetch("/api/seller/relist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(data.error || "That didn't work. Call us and we'll do it for you."); return; }
    router.refresh();
  }
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
      <button className="btn btn-soft" style={{ height: 44, fontSize: 15, background: "#FFFFFF" }} onClick={decline} disabled={busy} data-testid="relist-decline">{busy ? "Saving…" : "Don't offer it again"}</button>
      {err && <span className="errmsg" role="alert">{err}</span>}
    </span>
  );
}
