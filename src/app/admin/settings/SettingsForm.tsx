"use client";
import { useState } from "react";

const FEE_FIELDS: [string, string, string][] = [
  ["premium_rate", "Buyer's premium rate", "0.10 = 10%"], ["admin_fee", "Admin fee ($, incl. GST)", ""], ["storage_per_day", "Storage after the collection window ($/day)", "Grays: $50"],
  ["card_limit", "Charge in full below ($)", "Grays: 5000"], ["nrd_low", "Deposit ($)", ""], ["nrd_high", "Deposit for large totals ($)", ""],
  ["nrd_split", "Large total from ($)", ""], ["cancel_fee", "Cancellation fee ($)", ""], ["cancel_above", "Cancellation fee applies above ($)", ""],
  ["seller_fee_rate", "Seller fee rate", "0 = free for sellers; 0.03 = 3%"], ["seller_fee_min", "Minimum seller fee ($)", ""], ["withdrawal_fee", "Seller withdrawal fee ($)", "After it goes live"],
];
const AUCTION_FIELDS: [string, string][] = [["extend_minutes", "Late-bid extension (minutes)"], ["referral_days", "Seller decision time (business days)"], ["offer_days", "Offer period (business days)"], ["payment_days", "Balance due (business days)"], ["collection_days", "Collection window (business days)"],
  ["claim_days", "Buyer claim window after handover (business days)"], ["payout_days", "Pay seller within (business days)"], ["abandon_days", "Abandonment notice period (business days)"], ["exclusivity_days", "Seller exclusivity after listing (days)"]];

export function SettingsForm({ fees, auction, selling, terms }: { fees: Record<string, number>; auction: Record<string, number>; selling: Record<string, unknown>; terms: Record<string, unknown> }) {
  const [checks, setChecks] = useState(selling?.require_checks !== false);
  const [version, setVersion] = useState(String(terms?.buyer_version || ""));
  async function saveRaw(key: string, value: Record<string, unknown>) {
    const res = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Saved." : data.error || "Couldn't save.");
  }
  const [f, setF] = useState(fees);
  const [a, setA] = useState(auction);
  const [msg, setMsg] = useState("");
  async function save(key: string, value: Record<string, number>) {
    const clean = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, Number(v)]));
    const res = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value: clean }) });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? "Saved. The terms, help and fee previews now use these numbers." : data.error || "Couldn't save.");
  }
  return (
    <>
      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Fees and payment</h2>
        <p className="hint" style={{ margin: 0 }}>No card surcharge: surcharges on Visa, Mastercard and eftpos are banned in Australia from 1 October 2026.</p>
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
        <button className="btn btn-dark" style={{ alignSelf: "flex-start" }} onClick={() => saveRaw("selling", { ...selling, require_checks: checks })}>Save</button>
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
