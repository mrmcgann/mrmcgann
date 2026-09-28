"use client";
import { useState } from "react";

const FEE_FIELDS: [string, string, string][] = [
  ["premium_rate", "Buyer's premium rate", "0.10 = 10%"], ["admin_fee", "Admin fee ($)", ""], ["surcharge_rate", "Card surcharge rate", "0.012 = 1.2%"],
  ["card_limit", "Charge in full below ($)", "Grays: 5000"], ["nrd_low", "Deposit ($)", ""], ["nrd_high", "Deposit for large totals ($)", ""],
  ["nrd_split", "Large total from ($)", ""], ["cancel_fee", "Cancellation fee ($)", ""], ["cancel_above", "Cancellation fee applies above ($)", ""],
];
const AUCTION_FIELDS: [string, string][] = [["extend_minutes", "Late-bid extension (minutes)"], ["referral_days", "Seller decision time (business days)"], ["offer_days", "Offer period (business days)"], ["payment_days", "Balance due (business days)"], ["collection_days", "Collection window (business days)"]];

export function SettingsForm({ fees, auction }: { fees: Record<string, number>; auction: Record<string, number> }) {
  const [f, setF] = useState(fees);
  const [a, setA] = useState(auction);
  const [msg, setMsg] = useState("");
  async function save(key: string, value: Record<string, number>) {
    const clean = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, Number(v)]));
    const res = await fetch("/api/admin/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value: clean }) });
    setMsg(res.ok ? "Saved." : "Couldn't save.");
  }
  return (
    <>
      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Buyer fees and payment</h2>
        <div className="grid3">{FEE_FIELDS.map(([k, l, h]) => <label className="field" key={k}><span>{l}</span><input className="input" inputMode="decimal" value={f[k] ?? ""} onChange={(e) => setF({ ...f, [k]: e.target.value as unknown as number })} />{h && <span className="hint">{h}</span>}</label>)}</div>
        <button className="btn btn-dark" style={{ alignSelf: "flex-start" }} onClick={() => save("fees", f)}>Save fees</button>
      </div>
      <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800 }}>Auction rules</h2>
        <div className="grid3">{AUCTION_FIELDS.map(([k, l]) => <label className="field" key={k}><span>{l}</span><input className="input" inputMode="numeric" value={a[k] ?? ""} onChange={(e) => setA({ ...a, [k]: e.target.value as unknown as number })} /></label>)}</div>
        <button className="btn btn-dark" style={{ alignSelf: "flex-start" }} onClick={() => save("auction", a)}>Save rules</button>
      </div>
      {msg && <div className="notice ok">{msg}</div>}
    </>
  );
}
