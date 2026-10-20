"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Record money that arrived in the trust account against the member whose reference it carries.
// The payer's name must look like the member's (payments come only from an account in their name).
export function RecordDeposit() {
  const router = useRouter();
  const [f, setF] = useState({ member: "", amount: "", payerName: "", payerBsb: "", payerAccount: "", method: "bank", reference: "", note: "" });
  const [confirmName, setConfirmName] = useState(false);
  const [needs, setNeeds] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch("/api/admin/record-deposit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, confirmName }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 409 && d.needsConfirm) { setNeeds(true); setMsg({ ok: false, text: d.error }); return; }
    if (!res.ok) { setMsg({ ok: false, text: d.error || "Couldn't record it." }); return; }
    setMsg({ ok: true, text: d.note || "Recorded." });
    setF({ member: "", amount: "", payerName: "", payerBsb: "", payerAccount: "", method: "bank", reference: "", note: "" });
    setNeeds(false); setConfirmName(false);
    router.refresh();
  }
  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="record-deposit">
      <div className="grid3">
        <label className="field"><span>Member reference (BID…), BPAY CRN or email</span><input className="input" value={f.member} onChange={set("member")} placeholder="BIDK7M2QX" autoComplete="off" /></label>
        <label className="field"><span>Amount received ($)</span><input className="input" inputMode="decimal" value={f.amount} onChange={set("amount")} /></label>
        <label className="field"><span>How it came</span><select className="input" value={f.method} onChange={set("method")}><option value="bank">Bank transfer</option><option value="payid">PayID / Osko</option><option value="bpay">BPAY</option></select></label>
        <label className="field"><span>Name on the paying account</span><input className="input" value={f.payerName} onChange={set("payerName")} placeholder="As on the statement" /></label>
        <label className="field"><span>Their BSB</span><input className="input" inputMode="numeric" value={f.payerBsb} onChange={set("payerBsb")} placeholder="For refunds" /></label>
        <label className="field"><span>Their account number</span><input className="input" inputMode="numeric" value={f.payerAccount} onChange={set("payerAccount")} placeholder="For refunds" /></label>
        <label className="field"><span>Statement reference (optional)</span><input className="input" value={f.reference} onChange={set("reference")} /></label>
        <label className="field"><span>Note (optional)</span><input className="input" value={f.note} onChange={set("note")} /></label>
      </div>
      {needs && <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontWeight: 600 }}><input type="checkbox" checked={confirmName} onChange={(e) => setConfirmName(e.target.checked)} style={{ width: 20, height: 20 }} /> I&apos;ve confirmed this account belongs to the member (for example a joint account).</label>}
      {msg && <div className={`notice ${msg.ok ? "ok" : "bad"}`} role="status">{msg.text}</div>}
      <button className="btn btn-dark" style={{ alignSelf: "flex-start" }} disabled={busy}>{busy ? "Recording…" : "Record deposit"}</button>
    </form>
  );
}

// A correction to someone's balance (a typo when recording, a bank fee). Needs a reason; it shows in their history.
export function AdjustDeposit() {
  const router = useRouter();
  const [f, setF] = useState({ member: "", amount: "", note: "" });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const res = await fetch("/api/admin/adjust-deposit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: d.error || "Couldn't save it." }); return; }
    setMsg({ ok: true, text: "Saved. It shows in their history with your reason." });
    setF({ member: "", amount: "", note: "" });
    router.refresh();
  }
  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }} data-testid="adjust-deposit">
      <div className="grid3">
        <label className="field"><span>Member reference (BID…), BPAY CRN or email</span><input className="input" value={f.member} onChange={set("member")} autoComplete="off" /></label>
        <label className="field"><span>Change ($, minus to take off)</span><input className="input" value={f.amount} onChange={set("amount")} placeholder="-500" /></label>
        <label className="field"><span>Reason (they&apos;ll see it)</span><input className="input" value={f.note} onChange={set("note")} placeholder="Recorded twice by mistake" /></label>
      </div>
      {msg && <div className={`notice ${msg.ok ? "ok" : "bad"}`} role="status">{msg.text}</div>}
      <button className="btn btn-soft" style={{ alignSelf: "flex-start" }} disabled={busy}>{busy ? "Saving…" : "Save correction"}</button>
    </form>
  );
}
