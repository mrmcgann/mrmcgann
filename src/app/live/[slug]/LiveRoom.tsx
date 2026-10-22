"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useViewer } from "@/components/Viewer";
import { Modal } from "@/components/Modal";
import { BidConfirm } from "@/components/BidConfirm";
import { DepositShort } from "@/components/deposit/DepositNeed";
import { CarArt } from "@/components/CarArt";
import { lotFees, priceBreakdown } from "@/lib/fees";
import { dateTime, km, money } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { ackPayLine } from "@/lib/deposits";
import { rightsLine, warrantySign } from "@/lib/listing";
import { allInMoney, estimateAllInText, estimateText, hasEstimate } from "@/lib/estimate";
import { liveLine, nextBid, quickBids, resultLine, secondsLeft, streamEmbed, type LiveLot, type LiveSale } from "@/lib/live";
import type { Fees, Lot } from "@/lib/types";
import { ACK_CHECK, feesLine, premiumLabel } from "@/lib/transport";

type Room = { sale: LiveSale; current: LiveLot | null; next: LiveLot[]; done: LiveLot[]; waiting: number; server_time: string };
type LotMsg = Partial<LiveLot> & { id: number };

// The live auction room: the stream (when there is one), the vehicle that's up, its price and countdown, quick bids,
// what's coming up and the results so far. Changes arrive by Broadcast on sale:<id> and lot:<id>; the edge-cached
// /api/sales/[slug]/live endpoint catches up after a reconnect and covers for Realtime if it's down.
export function LiveRoom({ initial, fees, licences }: { initial: Room; fees: Fees; licences?: string }) {
  const v = useViewer();
  const router = useRouter();
  const [room, setRoom] = useState<Room>(initial);
  const [skew, setSkew] = useState(() => new Date(initial.server_time).getTime() - Date.now());
  const [rt, setRt] = useState(false);
  const [tick, setTick] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [ask, setAsk] = useState<number | null>(null);
  const [maxOpen, setMaxOpen] = useState(false);
  const [maxAmount, setMaxAmount] = useState("");
  const [maxStage, setMaxStage] = useState<number | null>(null);
  const [maxErr, setMaxErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [short, setShort] = useState<{ need: number; have: number; amount: number } | null>(null);
  const [myMax, setMyMax] = useState<Record<number, number>>({});
  const sale = room.sale;
  const cur = room.current;
  const curId = cur?.id ?? null;
  const userId = v.user?.id || null;

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/sales/${sale.slug}/live`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as Room;
      setSkew(new Date(j.server_time).getTime() - Date.now());
      setRoom((prev) => {
        // an older cached answer never undoes a newer broadcast on the same vehicle
        if (prev.current && j.current && prev.current.id === j.current.id && j.current.bid_count < prev.current.bid_count && j.current.status === prev.current.status) {
          return { ...j, current: prev.current };
        }
        return j;
      });
    } catch { /* offline for a moment */ }
  }, [sale.slug]);

  const applyLot = useCallback((p: LotMsg) => {
    setRoom((prev) => {
      if (!prev.current || prev.current.id !== p.id) return prev;
      if (p.bid_count !== undefined && p.bid_count < prev.current.bid_count && p.status === prev.current.status) return prev;
      return { ...prev, current: { ...prev.current, ...p } as LiveLot };
    });
    if (p.status && p.status !== "live") setTimeout(() => void load(), 400);
  }, [load]);

  // the sale's channel: a new vehicle up, a call from the auctioneer, pause, finish
  useEffect(() => {
    const db = supabaseBrowser();
    const ch = db.channel(`sale:${sale.id}`, { config: { private: false } })
      .on("broadcast", { event: "sale" }, ({ payload }: { payload: Partial<LiveSale> }) => {
        setRoom((prev) => ({ ...prev, sale: { ...prev.sale, ...payload } }));
        void load();
      })
      .subscribe((s: string) => { setRt(s === "SUBSCRIBED"); if (s === "SUBSCRIBED") void load(); });
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); db.removeChannel(ch); };
  }, [sale.id, load]);

  // the vehicle that's up: every bid
  useEffect(() => {
    if (!curId) return;
    const db = supabaseBrowser();
    const ch = db.channel(`lot:${curId}`, { config: { private: false } })
      .on("broadcast", { event: "lot" }, ({ payload }: { payload: LotMsg }) => applyLot(payload)).subscribe();
    return () => { db.removeChannel(ch); };
  }, [curId, applyLot]);

  // fallback polling: fast without Realtime, slow with it; and a 4-times-a-second clock for the countdown
  useEffect(() => {
    const every = rt ? 15_000 : sale.live_status === "running" ? 2_000 : 10_000;
    const t = setInterval(() => { if (document.visibilityState === "visible") void load(); }, every);
    return () => clearInterval(t);
  }, [rt, sale.live_status, load]);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 250); return () => clearInterval(t); }, []);

  const open = !!cur && cur.live_state === "open" && cur.status === "live";
  const paused = sale.live_status === "paused";
  const left = open && !paused ? secondsLeft(cur!.ends_at, skew) : 0;
  const windowSecs = Math.max(sale.lot_seconds, sale.extend_seconds);
  void tick;
  // once the countdown runs out, ask again shortly so the result shows without waiting for the next broadcast
  const lastZero = useRef<number | null>(null);
  useEffect(() => {
    if (open && left === 0 && lastZero.current !== curId) { lastZero.current = curId; const t = setTimeout(() => void load(), 1500); return () => clearTimeout(t); }
  }, [open, left, curId, load]);

  const lotFeesNow = useMemo(() => (cur ? lotFees(fees, cur as unknown as Lot) : fees), [cur, fees]);
  const leading = !!userId && !!cur && cur.leader_id === userId;
  const bids = cur && open ? quickBids(cur) : [];
  const allIn = cur ? priceBreakdown(Math.max(Number(cur.current_bid) || 0, Number(cur.start_price) || 0), lotFeesNow).total : 0;
  const stream = streamEmbed(sale.stream_url);

  function setupNeeded(): boolean {
    if (!userId) { router.push(`/join?next=/live/${sale.slug}`); return true; }
    if (v.profile?.suspended) { setMsg({ kind: "bad", text: "Your account can't bid at the moment. Call us if you think that's a mistake." }); return true; }
    if (v.missing.length) { router.push(`/join?step=${v.missing[0]}&next=/live/${sale.slug}`); return true; }
    if (v.profile?.terms_current === false) { router.push(`/lot/${curId}#bid`); return true; }
    return false;
  }
  async function place(amount: number) {
    if (!cur) return;
    setBusy(true); setMsg(null); setShort(null);
    const res = await fetch("/api/bid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: cur.id, max: amount }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false); setAsk(null); setMaxOpen(false);
    if (res.status === 402) { setShort({ need: data.need, have: data.have, amount }); return; }
    if (!res.ok) { setMsg({ kind: "bad", text: data.error || "That bid didn't go through. Try again." }); void load(); return; }
    setMyMax((m) => ({ ...m, [cur.id]: Math.max(m[cur.id] || 0, amount) }));
    applyLot({ id: cur.id, current_bid: data.current_bid, ends_at: data.ends_at, leader_id: data.status === "leading" ? userId : cur.leader_id, bid_count: cur.bid_count + 1 });
    setMsg(data.status === "leading" ? { kind: "ok", text: `You're in front at ${money(data.current_bid)}.` } : { kind: "bad", text: `Another bidder's maximum is higher: ${money(data.current_bid)}. Bid again?` });
    void load();
  }
  // withdrawing a bid is allowed until the hammer falls; the countdown then gives the room a moment to answer
  async function withdraw() {
    if (!cur || !window.confirm("Withdraw your bid now? The price is worked out again without it.")) return;
    setBusy(true); setMsg(null);
    const res = await fetch("/api/bid", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: cur.id }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ kind: "bad", text: data.error || "Couldn't withdraw your bid." }); return; }
    setMyMax((m) => { const n = { ...m }; delete n[cur.id]; return n; });
    setMsg({ kind: "ok", text: "Your bid has been withdrawn." });
    void load();
  }
  function tap(amount: number) {
    if (setupNeeded()) return;
    if (agreed) void place(amount); else setAsk(amount);
  }

  const statusPill = sale.live_status === "running" ? <span className="lv-pill on" data-testid="live-status">Live now</span>
    : paused ? <span className="lv-pill paused" data-testid="live-status">Paused</span>
    : sale.live_status === "ended" ? <span className="lv-pill" data-testid="live-status">Finished</span>
    : <span className="lv-pill" data-testid="live-status">Starts {dateTime(sale.starts_at)}</span>;

  return (
    <div className="lv">
      <div className="lv-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div className="pill-row" style={{ gap: 8 }}>{statusPill}{rt && sale.live_status === "running" && <span className="hint" style={{ margin: 0 }}>Updating live</span>}</div>
          <h1 className="d2" style={{ fontSize: "clamp(34px,5vw,60px)" }} data-testid="live-title">{sale.title}.</h1>
          {sale.auctioneer && <span className="lv-pill" style={{ alignSelf: "flex-start" }} data-testid="live-auctioneer">Auctioneer: {sale.auctioneer}</span>}
          <span className="muted">{[sale.seller_label, sale.state].filter(Boolean).join(" · ")}{licences ? `${sale.seller_label || sale.state ? " · " : ""}${licences}` : ""}</span>
        </div>
        <Link className="btn btn-soft" href={`/calendar`} style={{ height: 44, fontSize: 14 }}>Auction calendar</Link>
      </div>

      {sale.live_message && sale.live_status !== "scheduled" && <div className={`lv-call${paused ? " paused" : ""}`} role="status" aria-live="assertive" data-testid="live-message">{sale.live_message}</div>}

      <div className="lv-grid">
        <div className="lv-stage">
          {stream && sale.live_status !== "ended" ? (
            <div className="lv-video"><iframe src={stream} title={`${sale.title}: live stream`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>
          ) : (
            <div className="lv-photo">{cur?.cover_path ? <img src={photoUrl(cur.cover_path)} alt={cur.title} /> : <CarArt type={cur?.category === "motorbikes" ? "bike" : "car"} />}</div>
          )}
          {cur ? (
            <div className="lv-lot" data-testid="live-lot">
              <span className="muted">{cur.sale_order ? `Lot ${cur.sale_order}` : `Lot ${cur.id}`} · {[cur.year, cur.odometer != null ? km(cur.odometer) : cur.hours != null ? `${cur.hours} hrs` : null, [cur.suburb, cur.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</span>
              <b className="lv-lot-t">{cur.title}</b>
              {hasEstimate(cur) && <span data-testid="live-estimate">Estimate <b>{estimateText(cur)}</b> · all-in <b>{estimateAllInText(cur, lotFeesNow)}</b></span>}
              <span className="hint" style={{ margin: 0 }} data-testid="live-terms">{warrantySign(cur.statutory_warranty) ? <b>{warrantySign(cur.statutory_warranty)} </b> : null}{premiumLabel(lotFeesNow)}, plus GST and the admin fee, applies.</span>
              <Link className="blue" href={`/lot/${cur.id}`} target="_blank" style={{ fontWeight: 700 }}>Full listing, condition report and photos ›</Link>
            </div>
          ) : sale.live_status === "scheduled" ? (
            <div className="lv-lot"><b className="lv-lot-t">The first vehicle goes up at {dateTime(sale.starts_at)}.</b><span className="muted">Bid early on any vehicle below: we bid for you up to your maximum when it&apos;s offered.</span></div>
          ) : null}
        </div>

        <div className="lv-console bidbox" data-testid="live-console">
          {cur ? (
            <>
              {open || cur.status === "sold" ? (
                <div className="lv-price">
                  <span className="k">{cur.status === "sold" ? "Sold for" : "Current bid"}</span>
                  <span className="v" data-testid="live-price">{money(cur.status === "sold" ? cur.sold_price : cur.current_bid)}</span>
                  {open && <><span className="k">All-in</span><span className="v" data-testid="live-allin">{allInMoney(allIn)}</span><span className="hint" style={{ margin: 0 }}>With the buyer&apos;s premium, GST and admin fee · {cur.bid_count} bids</span></>}
                </div>
              ) : (
                <div className="lv-price"><span className="k">Result</span><span className="v" style={{ fontSize: "clamp(30px,3.4vw,40px)", letterSpacing: "-0.03em" }} data-testid="live-price">{resultLine(cur).replace(/\.$/, "")}</span></div>
              )}
              {open && (
                <div className="lv-clock" aria-label={`${left} seconds left`}>
                  <div className="lv-bar"><i style={{ width: `${Math.min(100, (left / windowSecs) * 100)}%` }} className={left <= 5 ? "hot" : ""} /></div>
                  <span className={`lv-secs${left <= 5 ? " hot" : ""}`} data-testid="live-seconds">{paused ? "Paused" : left > 0 ? `${left}s` : "Closing…"}</span>
                </div>
              )}
              {(open || cur.status === "sold") && <span className="lv-line" data-testid="live-line">{liveLine(sale, cur)}</span>}
              {open && userId && (cur.leader_id || myMax[cur.id]) ? (
                <span className={`tag ${leading ? "lv-win" : "lv-out"}`} data-testid="live-you">{leading ? "You're the highest bidder" : myMax[cur.id] ? "You've been outbid" : ""}</span>
              ) : null}
              {open && !paused && (
                <div className="lv-bids">
                  {bids.map((b, i) => (
                    <button key={b} className={`btn ${i === 0 ? "btn-blue" : "btn-soft"}`} onClick={() => tap(b)} disabled={busy || leading} data-testid={i === 0 ? "live-bid" : undefined}>
                      <span>Bid {money(b)}</span><small>{money(priceBreakdown(b, lotFeesNow).total, true)} all-in</small>
                    </button>
                  ))}
                  <button className="linkbtn" onClick={() => { if (!setupNeeded()) { setMaxAmount(String(nextBid(cur) + 1000)); setMaxOpen(true); } }}>Or set a maximum and we&apos;ll bid for you</button>
                </div>
              )}
              {open && !paused && userId && (leading || myMax[cur.id]) ? <button className="linkbtn" onClick={withdraw} disabled={busy} data-testid="live-withdraw">Withdraw my bid (allowed until the hammer falls)</button> : null}
              {short && <DepositShort need={short.need} have={short.have} amount={short.amount} lotId={cur.id} />}
              {msg && <div className={`notice ${msg.kind}`} role="status">{msg.text}</div>}
              {!userId && open && <span className="hint" style={{ margin: 0 }}>Sign in (or join free: verify your mobile and ID once) to bid.</span>}
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <b style={{ fontSize: 22 }}>{sale.live_status === "ended" ? "The sale has finished." : sale.live_status === "scheduled" ? `Starts ${dateTime(sale.starts_at)}.` : "Next vehicle coming up."}</b>
              <span className="muted">{sale.live_status === "ended" ? "Thanks for bidding. Results are below." : `${room.waiting} vehicle${room.waiting === 1 ? "" : "s"} to go. Each one is offered for about ${sale.lot_seconds} seconds, and every bid near the end resets the countdown to ${sale.extend_seconds} seconds.`}</span>
            </div>
          )}
        </div>
      </div>

      {room.next.length > 0 && (
        <section className="lv-sec" aria-label="Coming up">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <h2 className="d3" style={{ fontSize: 32 }}>Coming up.</h2>
            <Link className="blue" href={`/auctions?sale=${sale.id}`} style={{ fontWeight: 700 }}>All {room.waiting} still to come, with filters ›</Link>
          </div>
          <div className="lv-rail">
            {room.next.map((l) => (
              <Link key={l.id} className="lv-card" href={`/lot/${l.id}`} data-testid="live-next">
                <span className="lv-thumb">{l.cover_path ? <img src={photoUrl(l.cover_path)} alt="" /> : <CarArt type="car" />}</span>
                <b>{l.title}</b>
                <span className="muted" style={{ fontSize: 14 }}>{l.sale_order ? `Lot ${l.sale_order} · ` : ""}{hasEstimate(l) ? `Estimate ${estimateText(l)} · ` : ""}{l.bid_count ? `${money(l.current_bid)} early bid` : `From ${money(l.start_price)}`} · about {new Date(l.ends_at || Date.now()).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" })}</span>
                <span className="blue" style={{ fontSize: 14, fontWeight: 700 }}>Bid early ›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {room.done.length > 0 && (
        <section className="lv-sec" aria-label="Results">
          <h2 className="d3" style={{ fontSize: 32 }}>Results so far.</h2>
          <div className="rows">
            {room.done.map((l) => <div key={l.id} data-testid="live-result"><span><Link className="blue" href={`/lot/${l.id}`}>{l.title}</Link></span><b>{resultLine(l)}</b></div>)}
          </div>
        </section>
      )}

      <p className="hint lv-small" data-testid="live-rules">Only registered bidders (a verified mobile and ID) can bid. Each vehicle is sold under the hammer by Tyrebiter as agent for its owner: when the countdown ends, the highest bid buys it if it meets the reserve; if not, it&apos;s passed in and nobody owes anything. Each bid is binding unless you withdraw it before the hammer falls. The price shown is the bid before fees; the all-in amount is what you&apos;d pay. The seller can&apos;t bid, and we never bid for the seller. The auctioneer may also take bids by phone from registered bidders, and settles any dispute about a bid from the bids recorded here (Terms of Sale, section 6). Vehicles are sold as is, where is: check the seller&apos;s photos and video, and order a mechanical inspection before the sale if you want one.</p>

      {ask != null && cur && (
        <Modal title={`Bid ${money(ask)} on the ${cur.title}?`} onClose={() => setAsk(null)}>
          <AgreeOnce lot={cur} amount={ask} fees={lotFeesNow} busy={busy} onAgree={() => { setAgreed(true); void place(ask); }} onClose={() => setAsk(null)} />
        </Modal>
      )}
      {maxOpen && cur && (
        <Modal title="Set a maximum." onClose={() => setMaxOpen(false)}>
          <label className="field"><span>Your maximum</span>
            <span className="moneyin"><span className="muted">$</span><input inputMode="numeric" value={maxAmount} onChange={(e) => { setMaxAmount(e.target.value); setMaxErr(""); }} /></span>
            <span className="hint">We bid for you, one increment at a time, only as far as needed, up to this. Minimum {money(nextBid(cur))}.</span></label>
          {maxErr && <div className="notice bad" role="alert">{maxErr}</div>}
          <button className="btn btn-blue" onClick={() => {
            const n = Number(String(maxAmount).replace(/[^0-9]/g, "")) || 0;
            if (n < nextBid(cur)) { setMaxErr(`Enter ${money(nextBid(cur))} or more.`); return; }
            setMaxOpen(false); setMaxStage(n);
          }}>Review</button>
        </Modal>
      )}
      {maxStage != null && cur && (
        <BidConfirm lot={{ title: cur.title, seller_type: null }} typed={maxStage} minNext={nextBid(cur)} fees={lotFeesNow} cardLabel={null} busy={busy}
          onPlace={() => { const n = maxStage; setAgreed(true); setMaxStage(null); void place(n); }} onClose={() => setMaxStage(null)} withdrawable />
      )}
    </div>
  );

}

// The first bid in the room: the all-in price and the as-is terms, once. After that, a tap is a bid.
function AgreeOnce({ lot, amount, fees, busy, onAgree, onClose }: { lot: LiveLot; amount: number; fees: Fees; busy: boolean; onAgree: () => void; onClose: () => void }) {
  const [ack, setAck] = useState(false);
  const p = priceBreakdown(amount, fees);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="allin" style={{ border: 0, padding: 0 }}>
        <div><span className="muted">Your bid</span><span>{money(amount)}</span></div>
        <div><span className="muted">{feesLine(p.transport)}</span><span>{money(p.subtotal - p.price, true)}</span></div>
        <div className="tot"><span>All-in if you win at this bid</span><span>{money(p.total, true)}</span></div>
      </div>
      <label style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 14, lineHeight: 1.5, padding: "14px 16px", borderRadius: 16, background: "var(--panel)" }}>
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ width: 20, height: 20, margin: "1px 0 0", flexShrink: 0 }} data-testid="live-ack" />
        <span>For this sale, each tap of a bid button is a binding bid. I understand vehicles are sold <b>as is, where is</b>: {ACK_CHECK}. And {ackPayLine(p.payMode)}, under the <Link className="blue" href="/terms#t-live" target="_blank" style={{ fontWeight: 700 }}>terms of sale</Link>.</span>
      </label>
      <p className="hint" style={{ margin: 0 }}>{rightsLine("auction", null)}.</p>
      <button className="btn btn-blue" onClick={onAgree} disabled={busy || !ack} data-testid="live-agree">{busy ? "Bidding…" : `Bid ${money(amount)}`}</button>
      <button className="btn btn-soft" onClick={onClose}>Cancel</button>
      <span className="hint" style={{ margin: 0 }}>The {lot.title}.</span>
    </div>
  );
}
