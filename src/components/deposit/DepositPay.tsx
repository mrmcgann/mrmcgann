"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { depositFor } from "@/lib/fees";
import { limitChoices } from "@/lib/deposits";
import { money } from "@/lib/format";
import type { DepositSummary, Fees } from "@/lib/types";
import { PayBox, type Bank } from "./PayBox";

// "How much do you want to be able to bid?" → the deposit that needs, what to pay now, and exactly how to pay it.
// Then we watch for it to arrive (PayID is usually instant; a bank transfer can take up to a business day).
export function DepositPay({ fees, summary, bank, payIdOn, testMode, target, back, onArrived, compact }: {
  fees: Fees; summary: DepositSummary; bank: Bank; payIdOn: boolean; testMode: boolean;
  target?: number | null; back?: { href: string; label: string } | null; onArrived?: (s: DepositSummary) => void; compact?: boolean;
}) {
  const router = useRouter();
  const choices = useMemo(() => limitChoices(fees), [fees]);
  const cap = fees.deposit_cap ?? 0;
  // Start one step above what they can bid now (or at the amount they were trying to bid).
  const first = choices.find((c) => c.deposit > summary.available) || choices[choices.length - 1];
  const [pick, setPick] = useState<string>(target ? "custom" : String(first?.limit ?? "none"));
  const [custom, setCustom] = useState(target ? String(target) : "");
  const [waiting, setWaiting] = useState(false);
  const [arrived, setArrived] = useState<DepositSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const startBalance = useRef(summary.balance);

  const wanted = pick === "custom" ? Math.round(Number(custom.replace(/[^0-9.]/g, "")) || 0) : pick === "none" ? null : Number(pick);
  const need = wanted === null ? cap : depositFor(wanted, fees);
  const topUp = Math.max(0, Math.ceil(need - summary.available));
  const ready = wanted === null || wanted > 0;

  // Watch for the money (every 8 seconds for 15 minutes after they say they've sent it).
  useEffect(() => {
    if (!waiting) return;
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      if (n > 110) { clearInterval(t); return; }
      const r = await fetch("/api/deposit", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
      const s = r?.deposit as DepositSummary | undefined;
      if (s && s.balance > startBalance.current) { clearInterval(t); setWaiting(false); setArrived(s); onArrived?.(s); router.refresh(); }
    }, 8000);
    return () => clearInterval(t);
  }, [waiting, onArrived, router]);

  async function pretend() {
    setBusy(true); setErr("");
    const res = await fetch("/api/deposit/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: topUp || need }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setErr(d.error || "That didn't work."); return; }
    const r = await fetch("/api/deposit", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    const s = r?.deposit as DepositSummary | undefined;
    if (s) { setArrived(s); onArrived?.(s); }
    router.refresh();
  }

  if (arrived) {
    return (
      <div className="dp-done" role="status" data-testid="deposit-arrived">
        <b>Your deposit has arrived.</b>
        <span>{arrived.unlimited ? "You can bid any amount." : `You can now bid up to ${money(arrived.limit || 0)}.`}</span>
        {back && <Link className="btn btn-dark" style={{ height: 48, fontSize: 15, alignSelf: "flex-start" }} href={back.href}>{back.label}</Link>}
      </div>
    );
  }

  return (
    <div className={`dp${compact ? " compact" : ""}`} data-testid="deposit-pay">
      <fieldset className="dp-pick">
        <legend>How much do you want to be able to bid?</legend>
        <div className="lim-chips">
          {choices.map((c) => {
            const k = String(c.limit ?? "none");
            return (
              <button key={k} type="button" className={`lim-chip${pick === k ? " on" : ""}`} aria-pressed={pick === k} onClick={() => setPick(k)} data-testid={`limit-${k}`}>
                <b>{c.label}</b><span>{money(c.deposit)} deposit</span>
              </button>
            );
          })}
          <label className={`lim-chip lim-custom${pick === "custom" ? " on" : ""}`}>
            <b>Another amount</b>
            <span className="lim-in"><span aria-hidden="true">$</span><input inputMode="numeric" placeholder="12,000" value={custom} onFocus={() => setPick("custom")}
              onChange={(e) => { setPick("custom"); setCustom(e.target.value.replace(/[^0-9,]/g, "")); }} aria-label="The most you want to bid" data-testid="limit-custom" /></span>
          </label>
        </div>
      </fieldset>

      {ready && (
        <div className="dp-sum" data-testid="deposit-sum">
          <div><span className="muted">Deposit {wanted === null ? "for no limit" : `to bid up to ${money(wanted)}`}</span><b>{money(need)}</b></div>
          <div><span className="muted">You have free now</span><b>{money(summary.available)}</b></div>
          <div className="pay"><span>{topUp > 0 ? "Pay now" : "Nothing to pay"}</span><b data-testid="deposit-topup">{money(topUp)}</b></div>
        </div>
      )}

      {ready && topUp > 0 && (
        <PayBox amount={topUp} reference={summary.ref} bank={bank} payIdOn={payIdOn} request={{ url: "/api/deposit/payid", label: `Get a PayID for ${money(topUp)}` }}
          note={<span className="hint">Pay from an account in your own name (or a joint account you hold). We can&apos;t accept money from anyone else, and your deposit only ever goes back to the account it came from.</span>} />
      )}
      {ready && topUp === 0 && <div className="notice ok">Your deposit already covers this. {back && <Link className="blue" href={back.href}>{back.label}</Link>}</div>}

      {ready && topUp > 0 && (
        <div className="dp-act">
          {waiting
            ? <div className="dp-wait" role="status" data-testid="deposit-waiting"><span className="dot" aria-hidden="true" /><span><b>Watching for your deposit.</b> PayID usually lands in a minute; a bank transfer can take up to a business day. We&apos;ll text you when it arrives, so you can close this page.</span></div>
            : <button type="button" className="btn btn-blue" style={{ height: 56, fontSize: 17 }} onClick={() => setWaiting(true)} data-testid="deposit-sent">I&apos;ve sent {money(topUp)}</button>}
          {testMode && <button type="button" className="dp-test" onClick={pretend} disabled={busy} data-testid="deposit-test">{busy ? "Recording…" : `Test mode: pretend ${money(topUp)} arrived`}</button>}
          {err && <span className="errmsg">{err}</span>}
        </div>
      )}
    </div>
  );
}
