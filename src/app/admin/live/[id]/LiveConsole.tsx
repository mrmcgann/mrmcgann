"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CALLS, secondsLeft } from "@/lib/live";
import { dateTime, money } from "@/lib/format";
import type { Sale } from "@/lib/types";

type CLot = { id: number; title: string; status: string; live_state: string | null; sale_order: number | null; current_bid: number; start_price: number; bid_count: number;
  ends_at: string | null; reserve_met: boolean; has_reserve: boolean; sold_price: number | null; reserve_price: number | null };
type CBid = { id: number; amount: number; created_at: string; is_auto: boolean; source: string; who: string; ref: string | null };
type State = { sale: Sale & { paused_remaining?: string | null }; lots: CLot[]; bids: CBid[]; server_time: string };

async function step(saleId: number, op: string, extra: Record<string, unknown> = {}) {
  const res = await fetch("/api/admin/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saleId, op, ...extra }) });
  const d = await res.json().catch(() => ({}));
  return res.ok ? { ok: true as const, result: d.result } : { ok: false as const, error: d.error || "That didn't work." };
}

// One screen for the auctioneer: what's up, its reserve, the countdown, the latest bids (online and floor),
// calls everyone sees, pause, more time, knock down, next, and the running order.
export function LiveConsole({ saleId, slug, title }: { saleId: number; slug: string; title: string }) {
  const [st, setSt] = useState<State | null>(null);
  const [skew, setSkew] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [call, setCall] = useState("");
  const [floor, setFloor] = useState({ bidder: "", amount: "" });
  const [newReserve, setNewReserve] = useState("");
  const [autoNext, setAutoNext] = useState(true);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/live-room/${saleId}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as State;
      setSkew(new Date(j.server_time).getTime() - Date.now());
      setSt(j);
    } catch { /* try again on the next tick */ }
  }, [saleId]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 1000); return () => clearInterval(t); }, [load]);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 250); return () => clearInterval(t); }, []);

  async function run(op: string, extra: Record<string, unknown> = {}, ok?: (r: unknown) => string) {
    setBusy(true); setNote(null);
    const r = await step(saleId, op, extra);
    setBusy(false);
    if (!r.ok) setNote({ kind: "bad", text: r.error }); else if (ok) setNote({ kind: "ok", text: ok(r.result) });
    void load();
    return r.ok;
  }

  const sale = st?.sale;
  const cur = st?.lots.find((l) => l.id === sale?.current_lot_id) || null;
  const open = !!cur && cur.live_state === "open" && cur.status === "live";
  const paused = sale?.live_status === "paused";
  const left = open && !paused ? secondsLeft(cur!.ends_at, skew) : 0;
  const waiting = (st?.lots || []).filter((l) => l.live_state === "waiting" && l.status === "live");
  const reserveMet = cur ? !cur.has_reserve || cur.reserve_met : false;

  // when the countdown runs out, close it and (if chosen) offer the next vehicle a few seconds later (once per vehicle)
  const autoFor = useRef<number | null>(null);
  useEffect(() => {
    if (!autoNext || !open || paused || left > 0 || !cur || autoFor.current === cur.id) return;
    autoFor.current = cur.id;
    setTimeout(() => void run("next", {}, (r) => (r ? "Next vehicle is up." : "That was the last vehicle: the sale has ended.")), 3000);
  });

  if (!st || !sale) return <p className="muted">Loading the console…</p>;
  const order = (st.lots || []).filter((l) => l.live_state === "waiting");
  const move = (i: number, d: number) => {
    const ids = order.map((l) => l.id);
    const j = i + d; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void run("order", { ids });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }} data-testid="live-console-admin">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div><h1 className="d2" style={{ fontSize: 40 }}>{title}.</h1>
          <span className="muted">Live auction · {sale.live_status === "scheduled" ? `starts ${dateTime(sale.starts_at)}` : sale.live_status} · {waiting.length} to go · {sale.lot_seconds}s each, bids reset to {sale.extend_seconds}s</span></div>
        <span className="pill-row"><Link className="btn btn-soft" href={`/live/${slug}`} target="_blank" style={{ height: 40, fontSize: 14 }}>Open the public room</Link><Link className="btn btn-soft" href="/admin/sale-events" style={{ height: 40, fontSize: 14 }}>Sale settings</Link></span>
      </div>
      {note && <div className={`notice ${note.kind}`} role="status" data-testid="console-note">{note.text}</div>}

      {sale.live_status === "scheduled" && (
        <div className="admin-card" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ fontSize: 20 }}>Ready when you are.</b>
          <button className="btn btn-blue" disabled={busy || !waiting.length} onClick={() => run("start", {}, () => "The sale has started. First vehicle is up.")} data-testid="console-start">Start the sale</button>
          {!waiting.length && <span className="hint">Add vehicles to this sale (and publish them) first.</span>}
        </div>
      )}

      {cur && (
        <div className="admin-card" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span className="muted">{cur.sale_order ? `Lot ${cur.sale_order}` : `Lot ${cur.id}`} · <Link className="blue" href={`/admin/lots/${cur.id}`} target="_blank">Edit</Link></span>
            <b style={{ fontSize: 26, lineHeight: 1.2 }} data-testid="console-lot">{cur.title}</b>
            <div className="big2">
              <div><div className="k">{cur.status === "sold" ? "Sold for" : "Current bid"}</div><div className="v" data-testid="console-price">{money(cur.status === "sold" ? cur.sold_price : cur.current_bid)}</div><div className="hint">{cur.bid_count} bid{cur.bid_count === 1 ? "" : "s"}</div></div>
              <div><div className="k">Reserve</div><div className="v" style={{ fontSize: 28 }}>{cur.reserve_price ? money(cur.reserve_price) : "None"}</div>
                <div className="hint">{cur.reserve_price ? (reserveMet ? "Met: it's on the market" : `Needs ${money(Number(cur.reserve_price) - Number(cur.current_bid))} more`) : "Sells to the highest bid"}</div></div>
            </div>
            {open && <div className="lv-clock"><div className="lv-bar"><i style={{ width: `${Math.min(100, (left / Math.max(sale.lot_seconds || 60, sale.extend_seconds || 20)) * 100)}%` }} className={left <= 5 ? "hot" : ""} /></div><span className={`lv-secs${left <= 5 ? " hot" : ""}`} data-testid="console-seconds">{paused ? "Paused" : `${left}s`}</span></div>}
            {!open && <span className="lv-line">{cur.status === "sold" ? `Sold for ${money(cur.sold_price)}.` : cur.status === "referred" ? "Below reserve: referred to the seller." : cur.status === "offers" || cur.status === "passed" ? `Passed in${cur.bid_count ? ` at ${money(cur.current_bid)}` : ""}.` : "Closed."}</span>}
            <div className="pill-row">
              {open && !paused && <button className="btn btn-dark" disabled={busy} onClick={() => run("close", {}, (r) => (r === "sold" ? "Sold." : r === "referred" ? "Referred to the seller." : "Passed in."))} data-testid="console-close">Knock it down now</button>}
              {open && !paused && <button className="btn btn-soft" disabled={busy} onClick={() => run("time", { seconds: 30 })}>+30 seconds</button>}
              {open && !paused && <button className="btn btn-soft" disabled={busy} onClick={() => run("pause", {})} data-testid="console-pause">Pause</button>}
              {paused && <button className="btn btn-blue" disabled={busy} onClick={() => run("resume")} data-testid="console-resume">Resume</button>}
              {!open && sale.live_status !== "ended" && sale.live_status !== "scheduled" && <button className="btn btn-blue" disabled={busy} onClick={() => run("next", {}, (r) => (r ? "Next vehicle is up." : "That was the last vehicle: the sale has ended."))} data-testid="console-next">Next vehicle</button>}
            </div>
            <label className="checkrow"><input type="checkbox" checked={autoNext} onChange={(e) => setAutoNext(e.target.checked)} /> Offer the next vehicle 3 seconds after each one closes</label>
            {open && cur.reserve_price ? (
              <form className="pill-row" onSubmit={(e) => { e.preventDefault(); const n = Math.round(Number(newReserve.replace(/[^0-9]/g, ""))); if (!(n > 0)) return; if (!confirm(`The seller has told you to lower the reserve to ${money(n)}?`)) return; void run("reserve", { reserve: n }, (r) => { const x = r as { reserve_met: boolean }; return x.reserve_met ? `Reserve lowered to ${money(n)}: it's on the market.` : `Reserve lowered to ${money(n)}.`; }).then((ok) => ok && setNewReserve("")); }} data-testid="console-reserve">
                <input className="input" inputMode="numeric" value={newReserve} onChange={(e) => setNewReserve(e.target.value)} placeholder="Seller's new reserve" aria-label="Seller's new reserve" style={{ width: 180 }} />
                <button className="btn btn-soft" style={{ height: 48 }} disabled={busy}>Lower reserve</button>
                <button type="button" className="btn btn-soft" style={{ height: 48 }} disabled={busy} onClick={() => { if (confirm("The seller has told you to sell to the highest bid (remove the reserve)?")) void run("reserve", { reserve: null }, () => "Reserve removed: it sells to the highest bid."); }}>Remove reserve</button>
                <span className="hint" style={{ margin: 0, flexBasis: "100%" }}>Only on the seller&apos;s instruction (by phone). It&apos;s recorded against your name as their instruction. A reserve can&apos;t be raised.</span>
              </form>
            ) : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <b>Calls (everyone sees them)</b>
            <div className="chipset">{CALLS.filter((c) => !c.needsReserve || reserveMet).map((c) => <button key={c.text} type="button" disabled={busy || !open} onClick={() => run("message", { message: c.text })}>{c.text}</button>)}</div>
            <form className="pill-row" onSubmit={(e) => { e.preventDefault(); if (call.trim()) void run("message", { message: call }).then((ok) => ok && setCall("")); }}>
              <input className="input" value={call} onChange={(e) => setCall(e.target.value)} maxLength={80} placeholder="Your own words (80 characters)" style={{ flex: 1, minWidth: 180 }} />
              <button className="btn btn-soft" style={{ height: 48 }} disabled={busy}>Show</button>
            </form>
            <b>Floor or phone bid</b>
            <form className="pill-row" onSubmit={(e) => { e.preventDefault(); void run("floor", floor, (r) => { const x = r as { status: string; current_bid: number }; return x.status === "leading" ? `Floor bid in: they lead at ${money(x.current_bid)}.` : `Taken, but an online maximum is higher: ${money(x.current_bid)}.`; }).then((ok) => ok && setFloor({ bidder: "", amount: "" })); }}>
              <input className="input" value={floor.bidder} onChange={(e) => setFloor({ ...floor, bidder: e.target.value })} placeholder="Bidder number (BID…) or CRN" aria-label="Bidder number" style={{ width: 200 }} data-testid="floor-bidder" />
              <input className="input" inputMode="numeric" value={floor.amount} onChange={(e) => setFloor({ ...floor, amount: e.target.value })} placeholder="Amount" aria-label="Amount" style={{ width: 130 }} data-testid="floor-amount" />
              <button className="btn btn-dark" style={{ height: 48 }} disabled={busy || !open} data-testid="floor-bid">Take bid</button>
            </form>
            <span className="hint" style={{ margin: 0 }}>Only registered members with a verified ID can bid. Read the amount back before you take it.</span>
            <b>Latest bids</b>
            <div className="rows" data-testid="console-bids">
              {st.bids.length === 0 && <span className="muted">No bids yet.</span>}
              {st.bids.map((b) => <div key={b.id}><span>{b.who}{b.ref ? ` · ${b.ref}` : ""}<span className="muted"> · {b.source === "floor" ? "floor" : b.is_auto ? "auto" : "online"}</span></span><b>{money(b.amount)}</b></div>)}
            </div>
          </div>
        </div>
      )}

      {order.length > 0 && (
        <div className="admin-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <b style={{ fontSize: 20 }}>Running order ({order.length} to go)</b>
          <div className="rows">
            {order.map((l, i) => (
              <div key={l.id} data-testid="console-order">
                <span><b>{i + 1}.</b> {l.title} <span className="muted">· {l.bid_count ? `${money(l.current_bid)} early bid` : `from ${money(l.start_price)}`}{l.reserve_price ? ` · reserve ${money(l.reserve_price)}` : ""}</span></span>
                <span className="pill-row" style={{ gap: 6 }}>
                  <button className="linkbtn" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${l.title} up`}>Up</button>
                  <button className="linkbtn" disabled={busy || i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${l.title} down`}>Down</button>
                  {!open && sale.live_status !== "scheduled" && sale.live_status !== "ended" && <button className="linkbtn" disabled={busy} onClick={() => run("next", { lotId: l.id }, () => "That vehicle is up.")}>Offer now</button>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {sale.live_status !== "ended" && sale.live_status !== "scheduled" && (
        <div className="admin-card" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <span className="muted" style={{ flex: 1, minWidth: 240 }}>Finishing early? The vehicle that&apos;s up closes on its bids. Anything not yet offered is passed in (nothing is sold without the hammer), and its early bidders are told.</span>
          <button className="btn btn-soft" disabled={busy} onClick={() => { if (confirm("End the sale now? Vehicles not yet offered are passed in.")) void run("end", {}, (n) => `Sale ended. ${n} vehicle${n === 1 ? "" : "s"} not offered ${n === 1 ? "was" : "were"} passed in.`); }} data-testid="console-end">End the sale</button>
        </div>
      )}
      {sale.live_status === "ended" && <div className="notice ok">This sale has ended. <a className="blue" href={`/api/admin/sale-report/${saleId}`}>Download the results (CSV)</a></div>}
    </div>
  );
}
