"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DepositPay } from "@/components/deposit/DepositPay";
import { CopyButton, type Bank } from "@/components/deposit/PayBox";
import { depositSteps } from "@/lib/deposits";
import { money, dateLong } from "@/lib/format";
import { depositWhat as what } from "@/lib/deposits";
import type { Fees, MyDeposit } from "@/lib/types";

export type { MyDeposit };

// The bidder's deposit: what they can bid, what's holding it, raising the limit, getting it back, and every movement.
export function DepositHome({ d, fees, bank, payIdOn, testMode, target, back, name }: {
  d: MyDeposit; fees: Fees; bank: Bank; payIdOn: boolean; testMode: boolean; target: number | null; back: { href: string; label: string } | null; name: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const hasAny = d.balance > 0 || d.history.length > 0;
  const freeShare = d.balance > 0 ? Math.max(0, Math.min(1, d.available / d.balance)) : 0;
  const pending = d.history.filter((e) => e.kind === "withdrawal" && e.status === "pending");

  async function withdraw(e: React.FormEvent) {
    e.preventDefault();
    const n = Math.round(Number(amount.replace(/[^0-9.]/g, "")) * 100) / 100;
    if (!(n > 0)) { setMsg({ ok: false, text: "Enter how much to withdraw." }); return; }
    setBusy(true); setMsg(null);
    const res = await fetch("/api/deposit/withdraw", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: n }) });
    const r = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: r.error || "That didn't work. Try again." }); return; }
    setAmount("");
    setMsg({ ok: true, text: `Done. We'll send ${money(n, !Number.isInteger(n))} back to the account it came from, usually the same or next business day.` });
    router.refresh();
  }
  async function cancel(id: string) {
    const res = await fetch("/api/deposit/withdraw/cancel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    if (res.ok) router.refresh();
  }

  return (
    <div className="dep" data-testid="deposit-home">
      <div className="dep-top">
        <h1 className="d2">Bidding deposit.</h1>
        <p className="lede" style={{ margin: 0, fontSize: 19 }}>Refundable, and paid by PayID or bank transfer. It&apos;s how we keep bidding honest without ever taking your card.</p>
      </div>

      <div className="dep-hero">
        <div className={`paddle${d.balance > 0 ? "" : " empty"}`} data-testid="paddle">
          <span className="hole" aria-hidden="true" />
          <span className="lbl">{name ? `${name}, you can bid` : "You can bid"}</span>
          <span className="big" data-testid="paddle-limit">{d.unlimited ? <span className="serif">any amount</span> : money(d.limit || 0)}</span>
          <span className="sub">{d.unlimited ? `${money(d.available)} free covers the ${money(d.cap)} deposit for any one vehicle.`
            : (d.limit || 0) > 0 ? `${money(d.available)} free × ${Math.round(1 / (d.rate || 0.1))}. Top up any time to bid more.`
            : d.balance > 0 ? "Your deposit is holding the vehicles you're winning." : `Add a deposit (from ${money(d.min)}) to start bidding.`}</span>
          <span className="no">Bidder <b>{d.ref}</b></span>
        </div>
        <div className="dep-facts">
          <div className="dep-meter" role="img" aria-label={`${money(d.available)} free of ${money(d.balance)}`}>
            <i style={{ width: `${freeShare * 100}%`, background: "var(--ink)" }} />
            <i style={{ width: `${(1 - freeShare) * 100}%`, background: d.balance > 0 ? "var(--sun)" : "transparent" }} />
          </div>
          <div className="dep-fact"><span><i className="sw" style={{ background: "var(--ink)" }} />Free to bid with</span><b data-testid="dep-free">{money(d.available)}</b></div>
          <div className="dep-fact"><span><i className="sw" style={{ background: "var(--sun)" }} />Holding vehicles you&apos;re winning</span><b>{money(d.committed)}</b></div>
          <div className="dep-fact tot"><span>Your deposit</span><b data-testid="dep-balance">{money(d.balance)}</b></div>
          {d.pending_withdrawal > 0 && <div className="dep-fact"><span>On its way back to you</span><b>{money(d.pending_withdrawal)}</b></div>}
          <div className="dep-ref"><span>Your reference <b>{d.ref}</b></span><CopyButton value={d.ref} label="reference" /></div>
        </div>
      </div>

      {d.holding.length > 0 && (
        <section className="dep-sec" aria-labelledby="hold-h">
          <h2 id="hold-h">What your deposit is holding.</h2>
          <p className="muted">While you&apos;re winning, we keep the deposit for your maximum. If you&apos;re outbid it&apos;s free again straight away.</p>
          <div className="dep-list">
            {d.holding.map((h) => (
              <Link key={`${h.lot_id}-${h.why}`} href={`/lot/${h.lot_id}`} className="dep-row"><span><b>{h.title}</b><span className="muted"> · {h.why}</span></span><b>{money(h.amount)}</b></Link>
            ))}
          </div>
        </section>
      )}

      <section className="dep-sec" aria-labelledby="add-h">
        <h2 id="add-h">{d.balance > 0 ? "Raise your limit." : "Add your deposit."}</h2>
        <DepositPay fees={fees} summary={d} bank={bank} payIdOn={payIdOn} testMode={testMode} target={target} back={back} />
      </section>

      <section className="dep-sec" aria-labelledby="how-h">
        <h2 id="how-h">How it works.</h2>
        <ol className="dep-steps">
          {depositSteps(fees).map(([t, x], i) => <li key={t}><span className="n">{i + 1}</span><b>{t}</b><span>{x}</span></li>)}
        </ol>
        <p className="hint" style={{ margin: 0 }}>If you win and don&apos;t pay, you lose the deposit that went towards that vehicle (half goes to the seller). <Link className="blue" href="/terms#t-payment">Terms of sale, sections 8 and 11 ›</Link></p>
      </section>

      {hasAny && (
        <section className="dep-sec" aria-labelledby="out-h">
          <h2 id="out-h">Get it back.</h2>
          {d.unpaid ? <div className="notice">Pay for the vehicle you won first, then you can withdraw what&apos;s left.</div>
            : d.available > 0 ? (
              <form className="dep-out" onSubmit={withdraw}>
                <label className="field"><span>Amount (up to {money(d.available)})</span>
                  <span className="moneyin"><span className="muted">$</span><input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(d.available)} data-testid="withdraw-amount" /></span>
                </label>
                <div className="dep-out-to">
                  <span className="muted">Goes back to</span>
                  <b>{d.refund_to?.name || "the account your deposit came from"}{d.refund_to?.bsb ? ` · BSB ${d.refund_to.bsb.replace(/^(\d{3})(\d{3})$/, "$1-$2")}` : ""}{d.refund_to?.ending ? ` · account ending ${d.refund_to.ending}` : ""}</b>
                </div>
                <div className="pill-row">
                  <button className="btn btn-dark" style={{ height: 50, fontSize: 15 }} disabled={busy} data-testid="withdraw-go">{busy ? "Sending…" : "Withdraw"}</button>
                  <button type="button" className="linkbtn" onClick={() => setAmount(String(d.available))}>All of it ({money(d.available)})</button>
                </div>
              </form>
            ) : <p className="muted" style={{ margin: 0 }}>{d.balance > 0 ? "All of your deposit is holding vehicles you're winning. It's free to withdraw once you're not." : "Nothing to withdraw."}</p>}
          {msg && <div className={`notice ${msg.ok ? "ok" : "bad"}`} role="status">{msg.text}</div>}
          {pending.map((w) => (
            <div key={w.id} className="dep-pend" data-testid="withdraw-pending"><span>{money(-w.amount, true)} refund requested {dateLong(w.created_at)}. We send it within a business day.</span><button type="button" className="linkbtn" onClick={() => cancel(w.id)}>Cancel it</button></div>
          ))}
        </section>
      )}

      {d.history.length > 0 && (
        <section className="dep-sec" aria-labelledby="hist-h">
          <h2 id="hist-h">Every movement.</h2>
          <div className="dep-list" data-testid="deposit-history">
            {d.history.map((e) => (
              <div key={e.id} className={`dep-row${e.status === "cancelled" ? " off" : ""}`}>
                <span><b>{what(e)}</b><span className="muted"> · {dateLong(e.created_at)}</span>
                  {e.invoice_id && <> · <Link className="blue" href={`/account/invoices/${e.invoice_id}`}>Invoice</Link></>}</span>
                <b className={e.amount > 0 ? "plus" : ""}>{e.amount > 0 ? "+" : "−"}{money(Math.abs(e.amount), !Number.isInteger(e.amount))}</b>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
