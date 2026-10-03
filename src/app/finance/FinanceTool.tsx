"use client";
import { useMemo, useState } from "react";
import { FREQ_LABEL, loan, type Frequency } from "@/lib/finance";
import { LeadButton } from "@/components/Partners";
import { money } from "@/lib/format";
import type { Partner } from "@/lib/types";

type LotRef = { id: number; title: string; make: string | null; model: string | null; year: number | null } | null;
const TERMS = [1, 2, 3, 4, 5, 6, 7];
const num = (s: string) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;

export function FinanceTool({ lenders, initialPrice, lot }: { lenders: Partner[]; initialPrice: number; lot: LotRef }) {
  const lowest = lenders.filter((l) => l.rate_from != null).sort((a, b) => (a.rate_from as number) - (b.rate_from as number))[0];
  const [price, setPrice] = useState(String(Math.round(initialPrice)));
  const [deposit, setDeposit] = useState("0");
  const [years, setYears] = useState(5);
  const [balloonPct, setBalloonPct] = useState(0);
  const [freq, setFreq] = useState<Frequency>("weekly");
  const [rate, setRate] = useState(String(lowest?.rate_from ?? 9));

  const amount = Math.max(0, num(price) - num(deposit));
  const balloon = Math.round(amount * balloonPct / 100);
  const months = years * 12;
  const mine = useMemo(() => loan(amount, num(rate), months, freq, balloon), [amount, rate, months, freq, balloon]);
  const per = FREQ_LABEL[freq];
  const vehicle = lot ? `${lot.title} (lot ${lot.id})` : undefined;
  const details = { amount, deposit: num(deposit), term_months: months, balloon, frequency: freq };
  const go = (p: Partner) => `/go/${p.slug}?src=finance&amount=${amount}&term=${months}${lot ? `&lot=${lot.id}&make=${encodeURIComponent(lot.make || "")}&model=${encodeURIComponent(lot.model || "")}&year=${lot.year || ""}` : ""}`;

  return (
    <>
      <div className="fintool">
        <div className="soft" style={{ gap: 14, background: "#FFFFFF", border: "1px solid var(--line)" }}>
          <div className="grid2">
            <label className="field"><span>Vehicle price</span><span className="money-in"><i>$</i><input className="input" inputMode="numeric" value={Number(num(price)).toLocaleString("en-AU")} onChange={(e) => setPrice(e.target.value)} aria-label="Vehicle price in dollars" /></span></label>
            <label className="field"><span>Deposit or trade-in</span><span className="money-in"><i>$</i><input className="input" inputMode="numeric" value={Number(num(deposit)).toLocaleString("en-AU")} onChange={(e) => setDeposit(e.target.value)} aria-label="Deposit in dollars" /></span></label>
          </div>
          <div className="field"><span>Loan term</span>
            <div className="seg" role="radiogroup" aria-label="Loan term in years">{TERMS.map((t) => <button key={t} type="button" role="radio" aria-checked={years === t} className={years === t ? "on" : ""} onClick={() => setYears(t)}>{t} yr{t > 1 ? "s" : ""}</button>)}</div>
          </div>
          <div className="grid2">
            <label className="field"><span>Interest rate (% p.a.)</span><input className="input" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /><span className="hint">{lowest ? `Starts at the lowest advertised rate below. Yours depends on your circumstances.` : "Enter a rate to estimate repayments."}</span></label>
            <label className="field"><span>Balloon payment</span>
              <select className="input" value={balloonPct} onChange={(e) => setBalloonPct(Number(e.target.value))}>{[0, 10, 20, 30, 40].map((b) => <option key={b} value={b}>{b ? `${b}% (${money(Math.round(amount * b / 100))})` : "None"}</option>)}</select>
            </label>
          </div>
          <div className="field"><span>Repayments</span>
            <div className="seg" role="radiogroup" aria-label="Repayment frequency">{(["weekly", "fortnightly", "monthly"] as Frequency[]).map((f) => <button key={f} type="button" role="radio" aria-checked={freq === f} className={freq === f ? "on" : ""} onClick={() => setFreq(f)}>{f[0].toUpperCase() + f.slice(1)}</button>)}</div>
          </div>
        </div>
        <div className="soft finresult" aria-live="polite">
          <span className="muted" style={{ fontWeight: 700 }}>Estimated repayments</span>
          <b className="big">{money(Math.round(mine.perPeriod))}<small>/{per}</small></b>
          <div className="rows" style={{ marginTop: 6 }}>
            <div><span className="muted">Amount borrowed</span><b>{money(amount)}</b></div>
            <div><span className="muted">Interest over {years} year{years > 1 ? "s" : ""}</span><b>{money(Math.round(mine.totalInterest))}</b></div>
            {balloon > 0 && <div><span className="muted">Balloon at the end</span><b>{money(balloon)}</b></div>}
            <div><span className="muted">Total repaid</span><b>{money(Math.round(mine.totalPaid))}</b></div>
          </div>
          <span className="hint">Estimate only, excluding lender fees. Not an offer of credit.</span>
        </div>
      </div>

      <section style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <h2 className="d3" style={{ fontSize: 40 }}>Compare lenders.</h2>
        {lenders.length === 0 ? (
          <div className="empty"><b style={{ fontSize: 20 }}>Lender comparisons are coming soon.</b><span className="muted">Use the calculator above in the meantime.</span></div>
        ) : (
          <div className="partners">
            {lenders.map((p) => {
              const est = p.rate_from != null ? loan(amount, p.rate_from, months, freq, balloon, p.establishment_fee || 0, p.monthly_fee || 0) : null;
              const fits = (p.min_amount == null || amount >= p.min_amount) && (p.max_amount == null || amount <= p.max_amount) && (p.max_term_months == null || months <= p.max_term_months) && (p.min_term_months == null || months >= p.min_term_months);
              return (
                <article className="partner" key={p.id}>
                  <div className="ph-head">
                    <span style={{ display: "flex", flexDirection: "column", gap: 2 }}><b style={{ fontSize: 20 }}>{p.name}</b><span className="muted" style={{ fontSize: 13 }}>{[p.licence, p.blurb].filter(Boolean).join(" · ")}</span></span>
                    {p.sponsored && <span className="tag" style={{ background: "var(--panel)" }}>Sponsored</span>}
                  </div>
                  <div className="nums">
                    <div><span>Rate from</span><b>{p.rate_from != null ? `${p.rate_from}% p.a.` : "N/A"}</b></div>
                    <div><span>Comparison rate</span><b>{p.comparison_rate != null ? `${p.comparison_rate}% p.a.*` : "N/A"}</b></div>
                    <div><span>Est. {freq} repayment</span><b>{est ? money(Math.round(est.perPeriod)) : "N/A"}</b></div>
                    <div><span>Fees</span><b>{[p.establishment_fee ? `${money(p.establishment_fee)} upfront` : null, p.monthly_fee ? `${money(p.monthly_fee)}/month` : null].filter(Boolean).join(", ") || "None listed"}</b></div>
                  </div>
                  {!fits && <span className="hint">Outside this lender&apos;s usual loan amounts or terms ({p.min_amount ? money(p.min_amount) : "any"} to {p.max_amount ? money(p.max_amount) : "any"}, {p.min_term_months || 12} to {p.max_term_months || 84} months).</span>}
                  <div className="acts">
                    {p.referral_url && <a className="btn btn-blue" href={go(p)} target="_blank" rel="sponsored noopener">Check your rate</a>}
                    {p.accepts_leads && <LeadButton partner={p} kind="finance" lotId={lot?.id} details={details} vehicle={vehicle} label="Ask them to call me" className={p.referral_url ? "btn btn-soft" : "btn btn-blue"} />}
                  </div>
                  <span className="hint">{p.comparison_rate != null ? `*Comparison rate based on ${p.comparison_basis || "a $30,000 secured loan over 5 years"}. ` : ""}{p.commission_note}</span>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
