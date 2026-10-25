"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Signing an offer to buy after the auction (typing the name on the account), declining it, or cancelling during the
// cooling-off period. A buyer who hasn't accepted the current Terms of Sale accepts them here first.
export function AfterAnswer({ id, open, name, until }: { id: string; open: boolean; name: string; until: string | null }) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [terms, setTerms] = useState(false);

  async function send(action: "accept" | "decline" | "cancel") {
    if (action === "accept" && !ack) return setErr("Tick the box to confirm you've read the contract.");
    if (action === "accept" && typed.trim().length < 3) return setErr(`Type your name to sign${name ? `: ${name}` : ""}.`);
    if (action === "decline" && !confirm("Decline this offer? It may go to someone else.")) return;
    if (action === "cancel" && !confirm("Cancel this purchase? It's free, and nothing is payable.")) return;
    setBusy(true); setErr("");
    const res = await fetch("/api/after-offer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, name: typed }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 409) { setTerms(true); return setErr(d.error || "Our terms have been updated."); }
    if (!res.ok) return setErr(d.error || "Couldn't do that. Please try again.");
    if (d.invoice_id) router.push(`/account/invoices/${d.invoice_id}`); else router.refresh();
  }

  async function acceptTerms() {
    setBusy(true);
    const res = await fetch("/api/terms/accept", { method: "POST" });
    setBusy(false);
    if (res.ok) { setTerms(false); setErr(""); }
  }

  if (!open && until) {
    return (
      <div className="soft" style={{ background: "var(--sun)", gap: 12 }} data-testid="after-cooling-box">
        <b style={{ fontSize: 18 }}>You&apos;ve signed. You can change your mind until {until}.</b>
        <span>Cancelling is free. If you don&apos;t, the sale is final then and your invoice is ready to pay. We don&apos;t take any money before then.</span>
        {err && <div className="notice bad" role="alert">{err}</div>}
        <button className="btn btn-soft" disabled={busy} onClick={() => send("cancel")} data-testid="after-cancel" style={{ alignSelf: "flex-start" }}>{busy ? "…" : "Cancel this purchase"}</button>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="after-sign">
      <label className="field">
        <span>Type your full name to sign{name ? <> (as it is on your account: <b>{name}</b>)</> : null}</span>
        <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="name" data-testid="after-name" />
      </label>
      <label style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 15, lineHeight: 1.5 }}>
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ width: 20, height: 20, flexShrink: 0 }} data-testid="after-ack" />
        <span>I&apos;ve read the contract and the documents above, and I agree to buy the vehicle at this price under them and the <Link className="blue" href="/terms" target="_blank">Terms of Sale</Link>.</span>
      </label>
      {err && <div className="notice bad" role="alert">{err}</div>}
      {terms && <button className="btn btn-dark" disabled={busy} onClick={acceptTerms} data-testid="after-terms-accept">{busy ? "Saving…" : "I accept the updated Terms of Sale"}</button>}
      <button className="btn btn-blue" disabled={busy} onClick={() => send("accept")} data-testid="after-accept">{busy ? "…" : "Sign and buy"}</button>
      <button className="btn btn-soft" disabled={busy} onClick={() => send("decline")} data-testid="after-decline">No thanks</button>
    </div>
  );
}
