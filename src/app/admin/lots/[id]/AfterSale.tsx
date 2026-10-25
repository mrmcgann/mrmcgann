"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";
import { env } from "@/lib/env";
import { afterWarrantyGuide, type AfterRule } from "@/lib/afterAuction";

export type AfterPerson = { id: string; name: string; mobile: string | null; bid: number | null; watcher: boolean; leader: boolean };

// Staff: sell a vehicle after the auction (migration 26). First the seller's written agreement to a price (from their
// dashboard, or recorded here with how they confirmed it in writing), then the offer: who it goes to, the price (never
// below the seller's), whether a statutory warranty applies, the state's forms, and who signs it for us.
export function AfterSale({ lotId, rule, sellerPrice, people, facts, consultant, offerOpen }: {
  lotId: number; rule: AfterRule; sellerPrice: number | null; people: AfterPerson[];
  facts: { state: string | null; year: number | null; odometer: number | null; category: string | null; gvm: number | null };
  consultant: string; offerOpen: boolean;
}) {
  const router = useRouter();
  const leader = people.find((p) => p.leader) || people[0];
  const [agreed, setAgreed] = useState("");
  const [note, setNote] = useState("");
  const [buyer, setBuyer] = useState(leader?.id || "");
  const [amount, setAmount] = useState(sellerPrice != null ? String(sellerPrice) : "");
  const [hours, setHours] = useState("24");
  const [who, setWho] = useState(consultant);
  const guess = useMemo(() => afterWarrantyGuide(facts.state, { ...facts, price: Number(amount) || null }), [facts, amount]);
  const [warranty, setWarranty] = useState<"" | "yes" | "no">("");
  const [wText, setWText] = useState("");
  const [docs, setDocs] = useState<{ name: string; path: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function post(action: string, body: Record<string, unknown>) {
    setBusy(true); setMsg(null);
    const res = await fetch(`/api/admin/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ ok: false, text: d.error || "That didn't work." }); return false; }
    router.refresh();
    return true;
  }

  async function upload(form: string, file: File | null | undefined) {
    if (!file) return;
    setBusy(true); setMsg(null);
    const res = await fetch("/api/admin/after-docs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, size: file.size, mime: file.type, name: form }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); setMsg({ ok: false, text: d.error || "Couldn't start the upload." }); return; }
    const put = await fetch(d.signedUrl, { method: "PUT", body: file, headers: { "content-type": file.type, "x-upsert": "false", ...(env.supabaseAnonKey ? { apikey: env.supabaseAnonKey } : {}) } });
    setBusy(false);
    if (!put.ok) { setMsg({ ok: false, text: "The upload didn't finish. Try again." }); return; }
    setDocs((list) => [...list.filter((x) => x.name !== form), { name: form, path: d.path }]);
  }

  const missing = rule.forms.filter((f) => !docs.some((d) => d.name === f));
  const pick = (v: "yes" | "no") => { setWarranty(v); if (v === "yes" && !wText && guess.applies) setWText(guess.text); };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }} data-testid="after-panel">
      <div className="soft" style={{ background: "var(--panel)", gap: 6 }}>
        <b>{rule.state} rules for a sale after the auction</b>
        <span style={{ fontSize: 14 }}>{rule.cooling_law}</span>
        {rule.warranty_hint && <span style={{ fontSize: 14 }}>{rule.warranty_hint} We carry it as the dealer.</span>}
        {rule.forms.length > 0 && <span style={{ fontSize: 14 }}>Paperwork with the offer: {rule.forms.join("; ")}. Use the regulator&apos;s own template, filled in for this vehicle.</span>}
        {rule.staff_note && <span style={{ fontSize: 14, fontWeight: 600 }}>{rule.staff_note}</span>}
      </div>

      {sellerPrice == null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }} data-testid="after-seller">
          <b>1. The seller&apos;s written agreement to a price</b>
          <span className="hint" style={{ margin: 0 }}>Not yet. The seller can accept the highest bid (or name their price) on their seller dashboard. If they confirmed a price to you in writing (email or text), record it here: they get a written confirmation.</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="input" inputMode="numeric" placeholder="Price they'll take ($)" value={agreed} onChange={(e) => setAgreed(e.target.value.replace(/[^\d]/g, ""))} style={{ maxWidth: 190 }} data-testid="after-agreed-amount" />
            <input className="input" placeholder="How they confirmed it in writing (e.g. their email of 26 Oct, 10:15 am)" value={note} onChange={(e) => setNote(e.target.value)} style={{ flex: 1, minWidth: 260 }} data-testid="after-agreed-note" />
            <button className="btn btn-dark" disabled={busy || !agreed} onClick={() => post("after-seller-agreed", { lotId, amount: Number(agreed), note })} data-testid="after-agreed-save">Record it</button>
          </div>
        </div>
      ) : <span data-testid="after-seller-price"><b>1. The seller agreed in writing</b> to sell for {money(sellerPrice)} or more.</span>}

      {sellerPrice != null && !offerOpen && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }} data-testid="after-offer-form">
          <b>2. The offer</b>
          <label className="field"><span>Offer it to (people who bid on it or watched it)</span>
            <select className="input" value={buyer} onChange={(e) => setBuyer(e.target.value)} data-testid="after-buyer">
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.mobile ? ` · ${p.mobile}` : ""}{p.bid != null ? ` · bid ${money(p.bid)}` : ""}{p.watcher && p.bid == null ? " · watching" : ""}{p.leader ? " (highest bidder)" : ""}</option>)}
            </select>
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label className="field" style={{ maxWidth: 200 }}><span>Price ({money(sellerPrice)} or more)</span>
              <input className="input" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} data-testid="after-amount" /></label>
            <label className="field" style={{ maxWidth: 160 }}><span>Open for (hours)</span>
              <select className="input" value={hours} onChange={(e) => setHours(e.target.value)}>{["4", "12", "24", "48", "72"].map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
            <label className="field" style={{ flex: 1, minWidth: 220 }}><span>Signed for us by</span>
              <input className="input" value={who} onChange={(e) => setWho(e.target.value)} data-testid="after-consultant" /></label>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontWeight: 700 }}>Statutory warranty for this sale</span>
            <span className="hint" style={{ margin: 0 }} data-testid="after-guess">Guide: {guess.text}</span>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className={`btn ${warranty === "yes" ? "btn-dark" : "btn-soft"}`} onClick={() => pick("yes")} data-testid="after-warranty-yes">One applies</button>
              <button className={`btn ${warranty === "no" ? "btn-dark" : "btn-soft"}`} onClick={() => pick("no")} data-testid="after-warranty-no">None applies</button>
            </div>
            {warranty === "yes" && <input className="input" placeholder="What it is, e.g. Dealer guarantee: 3 months or 5,000 km, whichever comes first" value={wText} onChange={(e) => setWText(e.target.value)} data-testid="after-warranty-text" />}
          </div>
          {rule.forms.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontWeight: 700 }}>The state&apos;s forms (PDF, filled in for this vehicle)</span>
              {rule.forms.map((f) => (
                <label key={f} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 14 }}>
                  <span style={{ minWidth: 260 }}>{docs.some((d) => d.name === f) ? "✓ " : ""}{f}</span>
                  <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => upload(f, e.target.files?.[0])} disabled={busy} data-testid="after-doc" />
                </label>
              ))}
            </div>
          )}
          <button className="btn btn-blue" disabled={busy || !buyer || !amount || !warranty || missing.length > 0} style={{ alignSelf: "flex-start" }} data-testid="after-send"
            onClick={() => post("after-offer", { lotId, userId: buyer, amount: Number(amount), hours: Number(hours), warranty: warranty === "yes", warrantyText: wText, docs, consultant: who })}>
            {busy ? "…" : "Send the offer"}
          </button>
          {missing.length > 0 && <span className="hint" style={{ margin: 0 }}>Attach: {missing.join("; ")}.</span>}
        </div>
      )}
      {msg && <div className={`notice${msg.ok ? "" : " bad"}`} role="alert">{msg.text}</div>}
    </div>
  );
}
