"use client";
import { useState } from "react";
import { money } from "@/lib/format";
import { formatCrn } from "@/lib/bpay";

export type Bank = { name: string; bsb: string; account: string; payId: string | null; bpayBiller?: string | null };

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(value); }
    catch {
      const t = document.createElement("textarea"); t.value = value; document.body.appendChild(t); t.select();
      try { document.execCommand("copy"); } catch { /* the value is on screen to type */ }
      t.remove();
    }
    setDone(true); setTimeout(() => setDone(false), 1800);
  }
  return <button type="button" className={`copybtn${done ? " ok" : ""}`} onClick={copy} aria-label={`Copy ${label}`}>{done ? "Copied" : "Copy"}</button>;
}

function Row({ k, v, copy, hl, testId }: { k: string; v: string; copy?: string; hl?: boolean; testId?: string }) {
  return (
    <div className={`payrow${hl ? " hl" : ""}`}>
      <span className="k">{k}</span>
      <span className="v" data-testid={testId}>{v}</span>
      {copy ? <CopyButton value={copy} label={k.toLowerCase()} /> : <span />}
    </div>
  );
}

// How to pay us: PayID or bank transfer into our account, with the exact amount and the reference that matches it to
// you. A single-use PayID (when the payments provider is switched on) does the matching by itself.
export function PayBox({ amount, reference, bank, payIdOn, request, note, crn }: {
  amount: number; reference: string; bank: Bank; payIdOn: boolean;
  /** The member's BPAY Customer Reference Number: shows BPAY too when our biller code is set. */
  crn?: string | null;
  /** Ask for a single-use PayID: POST here with { amount }. */
  request?: { url: string; label: string } | null;
  note?: React.ReactNode;
}) {
  const [one, setOne] = useState<{ payId: string; amount: number; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const whole = Number.isInteger(amount);
  async function getPayId() {
    if (!request) return;
    setBusy(true); setErr("");
    const res = await fetch(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(d.error || "PayID isn't available right now. Use the bank details."); return; }
    setOne({ payId: d.payId, amount: d.amount, expiresAt: d.expiresAt });
  }
  return (
    <div className="paybox" data-testid="paybox">
      {payIdOn && request && !one && (
        <div className="payone">
          <span><b>Quickest: a PayID just for this payment.</b> It shows our name before you pay, and we see it the moment it lands.</span>
          <button type="button" className="btn btn-dark" style={{ height: 46, fontSize: 15 }} onClick={getPayId} disabled={busy || !(amount > 0)}>{busy ? "Getting it…" : request.label}</button>
          {err && <span className="errmsg">{err}</span>}
        </div>
      )}
      {one ? (
        <>
          <Row k="PayID" v={one.payId} copy={one.payId} hl testId="pay-payid" />
          <Row k="Amount" v={money(one.amount, !Number.isInteger(one.amount))} copy={String(one.amount)} />
          <span className="hint">Pay it from your banking app to this PayID. It&apos;s for this payment only and expires {new Date(one.expiresAt).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}.</span>
        </>
      ) : (
        <>
          {payIdOn && request && <span className="payor">Or pay by bank transfer</span>}
          <Row k="Amount" v={money(amount, !whole)} copy={String(amount)} testId="pay-amount" />
          <Row k="Reference" v={reference} copy={reference} hl testId="pay-ref" />
          <Row k="Account name" v={bank.name} copy={bank.name} />
          <Row k="BSB" v={bank.bsb} copy={bank.bsb.replace(/\D/g, "")} />
          <Row k="Account number" v={bank.account} copy={bank.account.replace(/\D/g, "")} />
          {bank.payId && <Row k="Or PayID" v={bank.payId} copy={bank.payId} />}
          {bank.bpayBiller && crn && (
            <>
              <span className="payor">Or pay by BPAY</span>
              <Row k="Biller code" v={bank.bpayBiller} copy={bank.bpayBiller} testId="pay-biller" />
              <Row k="Reference (CRN)" v={formatCrn(crn)} copy={crn} hl testId="pay-crn" />
              <span className="hint">Your CRN is the same for every payment to us. BPAY can take a business day or two to reach us, so allow for that before the due date.</span>
            </>
          )}
        </>
      )}
      <div className="paywarn">
        <b>Always check before you pay.</b> We never change these details by email, text or phone, and we never ask you to pay a seller. Unsure? Call us first.
      </div>
      {note}
    </div>
  );
}
