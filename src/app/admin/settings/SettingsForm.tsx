"use client";
import { useState } from "react";
import { AFTER_DEFAULT, AFTER_STATES, STATE_NAMES } from "@/lib/afterAuction";

const FEE_FIELDS: [string, string, string][] = [
  ["premium_rate", "Buyer's premium rate", "0.10 = 10%"], ["admin_fee", "Admin fee ($, incl. GST)", ""], ["storage_per_day", "Storage after the collection window ($/day)", "Grays: $50"],
  ["deposit_rate", "Bidding deposit (share of the bid limit)", "0.10 = 10% (Manheim and Copart use 10%)"], ["deposit_min", "Minimum bidding deposit ($)", "Manheim's minimum: $500"],
  ["deposit_cap", "Deposit that means no limit ($)", "0 = no cap (always the rate). Default 5000"],
    ["seller_fee_rate", "Seller fee rate", "0 = free for sellers; 0.03 = 3%"], ["seller_fee_min", "Minimum seller fee ($)", ""], ["withdrawal_fee", "Seller withdrawal fee ($)", "After it goes live"],
  ["late_interest_rate", "Interest on overdue balances (% a year)", "10 = 10% a year. Shown in the Terms; keep it modest (20 at most)"],
];
const AUCTION_FIELDS: [string, string][] = [["extend_minutes", "Late-bid extension (minutes)"], ["referral_days", "Seller decision time (business days)"], ["offer_days", "Offer period (business days)"], ["payment_days", "Balance due (business days)"], ["collection_days", "Collection window (business days)"],
  ["claim_days", "Buyer claim window after handover (business days)"], ["payout_days", "Pay seller within (business days)"], ["abandon_days", "Abandonment notice period (business days)"], ["exclusivity_days", "Seller exclusivity after listing (days)"]];

export function SettingsForm({ fees, auction, selling, terms }: { fees: Record<string, number | string>; auction: Record<string, number>; selling: Record<string, unknown>; terms: Record<string, unknown> }) {
  const [checks, setChecks] = useState(selling?.require_checks !== false);
  const [inspFee, setInspFee] = useState(String(selling?.pre_inspection_fee ?? 220));
  // selling after the auction, state by state (migration 26): never Victoria; Tasmania and the NT once licensed
  const [after, setAfter] = useState<string[]>(Array.isArray(selling?.after_auction_states) ? (selling.after_auction_states as string[]) : AFTER_DEFAULT);
  const [version, setVersion] = useState(String(terms?.buyer_version || ""));
  async function saveRaw(key: string, value: Record<string, unknown>) {
    const res = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Saved." : data.error || "Couldn't save.");
  }
  const [f, setF] = useState(fees);
  const [a, setA] = useState(auction);
  const [msg, setMsg] = useState("");
  async function save(key: string, value: Record<string, number | string>) {
    // numbers, except how money is taken (a word) which is kept as it is
    const clean = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === "pay_mode" ? v : Number(v)]));
    const res = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value: clean }) });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Saved. The terms, help and fee previews now use these numbers." : data.error || "Couldn't save.");
  }
  return (
    <>
      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Fees and payment</h2>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }} data-testid="pay-mode">
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>How bidders pay (never by card, so no chargebacks)</legend>
          {([["transfer", "No deposit (like Turners)", "Anyone with a verified mobile and ID can bid, including buyers using finance. The winner pays the full amount by PayID or bank transfer within the balance-due days below. A buyer who doesn't pay is banned and can't come back with a new account."],
            ["deposit", "Bidding deposit first (like Copart and Manheim)", "Bidders pay a refundable deposit by PayID or bank transfer before they bid (the three deposit numbers below). A buyer who doesn't pay loses that deposit (half to the seller) and is banned."]] as const).map(([k, t, d]) => (
            <label key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "12px 14px", borderRadius: 16, border: `2px solid ${String(f.pay_mode || "transfer") === k ? "var(--ink)" : "var(--line)"}`, cursor: "pointer" }}>
              <input type="radio" name="pay_mode" checked={String(f.pay_mode || "transfer") === k} onChange={() => setF({ ...f, pay_mode: k })} style={{ marginTop: 4 }} />
              <span><b>{t}</b><br /><span className="muted" style={{ fontSize: 14 }}>{d}</span></span>
            </label>
          ))}
          <span className="hint">The Terms of sale and Help change with this. After switching, save a new terms version below so members accept the new terms before they bid again. A deposit change applies to bids from now on; fees are locked per vehicle when it goes live.</span>
        </fieldset>
        <div className="grid3">{FEE_FIELDS.map(([k, l, h]) => <label className="field" key={k}><span>{l}</span><input className="input" inputMode="decimal" value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value as unknown as number })} />{h && <span className="hint">{h}</span>}</label>)}</div>
        <button className="btn btn-dark" style={{ alignSelf: "flex-start" }} onClick={() => save("fees", f)}>Save fees</button>
      </div>
      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Auction rules</h2>
        <div className="grid3">{AUCTION_FIELDS.map(([k, l]) => <label className="field" key={k}><span>{l}</span><input className="input" inputMode="numeric" value={a[k] ?? ""} onChange={(e) => setA({ ...a, [k]: e.target.value as unknown as number })} /></label>)}</div>
        <button className="btn btn-dark" style={{ alignSelf: "flex-start" }} onClick={() => save("auction", a)}>Save rules</button>
      </div>
      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Selling checks</h2>
        <label style={{ display: "flex", gap: 10, alignItems: "center", fontWeight: 600 }}><input type="checkbox" checked={checks} onChange={(e) => setChecks(e.target.checked)} /> Require a signed seller agreement, seller ID, ownership check, VIN and PPSR before a vehicle can go live</label>
        <span className="hint">Leave this on in production. Turn it off only to demo the site with sample vehicles.</span>
        <label className="field" style={{ maxWidth: 360 }}><span>Inspection before listing ($ including GST)</span><input className="input" inputMode="numeric" value={inspFee} onChange={(e) => setInspFee(e.target.value)} data-testid="pre-inspection-fee" /><span className="hint">What sellers pay (from the proceeds, only if it sells) to have a mechanic inspect the vehicle before it lists. 0 hides the option. The amount is locked into each agreement when it&apos;s signed.</span></label>
        <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }} data-testid="after-states">
          <legend style={{ fontWeight: 700, marginBottom: 6 }}>Selling after the auction, by agreement</legend>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            {AFTER_STATES.map((st) => (
              <label key={st} style={{ display: "flex", gap: 6, alignItems: "center", fontWeight: 600 }}>
                <input type="checkbox" checked={after.includes(st)} onChange={(e) => setAfter(e.target.checked ? [...after, st] : after.filter((x) => x !== st))} /> {st}
              </label>
            ))}
          </div>
          <span className="hint">Where it&apos;s ticked, a vehicle passed in can be sold afterwards at a price the seller agrees in writing, by a written offer the buyer signs, with that state&apos;s cooling-off period and statutory warranty. Victoria is never on: a consigned vehicle can only be sold there at auction. Tick {STATE_NAMES.TAS.replace(/^the /, "")} only once we hold a motor vehicle trader licence there, and {STATE_NAMES.NT} only once we hold a motor vehicle dealer licence.</span>
        </fieldset>
        <button className="btn btn-dark" style={{ alignSelf: "flex-start" }} onClick={() => saveRaw("selling", { ...selling, require_checks: checks, pre_inspection_fee: Math.max(0, Math.round(Number(inspFee) || 0)), after_auction_states: AFTER_STATES.filter((st) => after.includes(st)) })}>Save</button>
      </div>
      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Terms version</h2>
        <label className="field"><span>Current buyer terms version</span><input className="input" value={version} onChange={(e) => setVersion(e.target.value)} /><span className="hint">Change this only after publishing new Terms of Sale. Every member must accept the new version before their next bid.</span></label>
        <button className="btn btn-dark" style={{ alignSelf: "flex-start" }} onClick={() => { if (confirm("Every member will have to accept the terms again before bidding. Continue?")) saveRaw("terms", { ...terms, buyer_version: version }); }}>Save version</button>
      </div>
      {msg && <div className="notice ok">{msg}</div>}
    </>
  );
}
