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
import { LiveMedia } from "@/components/LiveMedia";
import { lotFees, payMode, priceBreakdown } from "@/lib/fees";
import { dateTime, km, money } from "@/lib/format";
import { photoUrl } from "@/lib/photos";
import { buyNowPayLine } from "@/lib/deposits";
import { warrantySign } from "@/lib/listing";
import { coolingOffSign } from "@/lib/afterAuction";
import { allInMoney, estimateAllInText, estimateText, hasEstimate } from "@/lib/estimate";
import { liveLine, nextBid, quickBids, resultLine, secondsLeft, type LiveLot, type LiveMedia as Media, type LiveSale } from "@/lib/live";
import { auctionConditions, CONDITIONS_ACK } from "@/lib/conditions";
import type { Fees, Lot } from "@/lib/types";
import { premiumLabel } from "@/lib/transport";

type Room = { sale: LiveSale; current: LiveLot | null; next: LiveLot[]; done: LiveLot[]; waiting: number; media: Media | null; server_time: string };
type LotMsg = Partial<LiveLot> & { id: number };
// A note to this bidder about the vehicle that's up. One about the price (in front, outbid) only shows while the price
// is still that price, so it never goes stale; none shows after the hammer, when the result takes over.
type Note = { kind: "ok" | "bad"; text: string; lot: number; price?: number };
const lotNo = (l: LiveLot) => `Lot ${l.sale_order || l.id}`;
const lotFacts = (l: LiveLot) => [l.year, l.odometer != null ? km(l.odometer) : l.hours != null ? `${l.hours} hrs` : null, [l.suburb, l.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");

// The live auction room: first the auction's conditions, read and accepted once; then the vehicle that's up (its photos
// and the seller's walkaround video: there's no video of the auction), its price and countdown, one-tap bids, what's
// coming up and the results so far. Changes arrive by Broadcast on sale:<id> and lot:<id>; the edge-cached
// /api/sales/[slug]/live endpoint catches up after a reconnect and covers for Realtime if it's down.
export function LiveRoom({ initial, fees, licences, payDays = 2 }: { initial: Room; fees: Fees; licences?: string; payDays?: number }) {
  const v = useViewer();
  const router = useRouter();
  const [room, setRoom] = useState<Room>(initial);
  const [skew, setSkew] = useState(() => new Date(initial.server_time).getTime() - Date.now());
  const [rt, setRt] = useState(false);
  const [tick, setTick] = useState(0);
  const [maxOpen, setMaxOpen] = useState(false);
  const [maxAmount, setMaxAmount] = useState("");
  const [maxStage, setMaxStage] = useState<number | null>(null);
  const [maxErr, setMaxErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Note | null>(null);
  const [short, setShort] = useState<{ need: number; have: number; amount: number } | null>(null);
  const [myMax, setMyMax] = useState<Record<number, number>>({});
  const sale = room.sale;
  const cur = room.current;
  const curId = cur?.id ?? null;
  const userId = v.user?.id || null;
  // when the next vehicle goes up, its bid buttons wait 2 seconds, so a tap meant for the last one never lands on it
  // (worked out while rendering, so the new vehicle is never shown with its buttons live; the clock below re-renders)
  const [lotSince, setLotSince] = useState<{ id: number | null; at: number }>({ id: curId, at: 0 });
  if (lotSince.id !== curId) setLotSince({ id: curId, at: lotSince.id != null ? Date.now() : 0 });
  const fresh = lotSince.at > 0 && Date.now() - lotSince.at < 2000;

  // The auction's conditions, read and accepted before entering (recorded for members: bids in the room need it).
  // Someone who isn't signed in can read them and watch; they accept again, on the record, once they sign in to bid.
  const [entered, setEntered] = useState<boolean | null>(null);
  const [gateAck, setGateAck] = useState(false);
  const [gateErr, setGateErr] = useState("");
  const [entering, setEntering] = useState(false);
  const conditions = useMemo(() => auctionConditions({ payMode: payMode(fees), payDays }), [fees, payDays]);
  const seenKey = `tb-live-entered:${sale.id}`;
  useEffect(() => {
    if (!v.ready) return;
    let stop = false;
    if (!userId) {
      let seen = false;
      try { seen = sessionStorage.getItem(seenKey) === "1"; } catch { /* storage blocked: show the conditions */ }
      setEntered(seen);
      return;
    }
    void supabaseBrowser().from("sale_entries").select("sale_id").eq("sale_id", sale.id).eq("user_id", userId).maybeSingle()
      .then(({ data }: { data: { sale_id: number } | null }) => { if (!stop) setEntered(!!data); });
    return () => { stop = true; };
  }, [v.ready, userId, sale.id, seenKey]);
  async function enter() {
    setGateErr("");
    if (!userId) { try { sessionStorage.setItem(seenKey, "1"); } catch { /* fine: they'll see them again */ } setEntered(true); window.scrollTo(0, 0); return; }
    setEntering(true);
    const r = await fetch("/api/live/enter", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saleId: sale.id }) });
    const d = await r.json().catch(() => ({}));
    setEntering(false);
    if (!r.ok) { setGateErr(d.error || "We couldn't open the room. Try again."); return; }
    setEntered(true);
    window.scrollTo(0, 0);  // into the room from the top: the call, the vehicle, then the bids
  }
  // the member's own maximums in this sale (early bids left on the listings count), so the room shows they've bid and
  // can withdraw it until the hammer falls
  const lotKey = [cur?.id, ...room.next.map((l) => l.id)].filter(Boolean).join(",");
  useEffect(() => {
    if (!userId || !lotKey) return;
    let stop = false;
    void supabaseBrowser().from("max_bids").select("lot_id, max_amount").eq("bidder_id", userId).in("lot_id", lotKey.split(",").map(Number))
      .then(({ data }: { data: { lot_id: number; max_amount: number }[] | null }) => {
        if (stop || !data) return;
        setMyMax((m) => { const n = { ...m }; for (const r of data) n[r.lot_id] = Math.max(n[r.lot_id] || 0, Number(r.max_amount)); return n; });
      });
    return () => { stop = true; };
  }, [userId, lotKey]);

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
  const note = msg && cur && open && msg.lot === cur.id && (msg.price == null || Number(cur.current_bid) === msg.price) ? msg : null;
  // after the hammer: what it means for this bidder (the winner is the leader when it closed, until the room reloads)
  const closed = !!cur && cur.live_state === "closed";
  // passed in under the hammer and sold later by agreement (migration 26): the room still shows the auction's result
  const afterSold = !!cur && cur.status === "sold" && cur.sold_via === "after_auction";
  const won = closed && cur!.status === "sold" && !afterSold && !!userId && (cur!.winner_id ?? cur!.leader_id) === userId;
  // passed in below the reserve: its highest bidder is told a consultant will be in touch (where its state allows,
  // about buying it after the auction; otherwise about the next one)
  const topPassed = closed && cur!.status === "passed" && !!userId && cur!.bid_count > 0 && cur!.leader_id === userId;
  const bidHere = !!cur && !!myMax[cur.id];
  const soldAllIn = cur && cur.status === "sold" ? priceBreakdown(Number(cur.sold_price) || 0, lotFeesNow).total : 0;

  // on a phone the bid buttons sit below the photos and the vehicle: while they're out of view, a bar at the bottom of
  // the screen carries the price, the countdown and the next bid
  const bidsRef = useRef<HTMLDivElement | null>(null);
  const consoleRef = useRef<HTMLDivElement | null>(null);
  const [bidsSeen, setBidsSeen] = useState(true);
  const bidsShown = open && !paused;
  useEffect(() => {
    const el = bidsRef.current;
    if (!bidsShown || !el || typeof IntersectionObserver === "undefined") { setBidsSeen(true); return; }
    const io = new IntersectionObserver(([e]) => setBidsSeen(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [bidsShown, curId, entered]);
  const dock = !!entered && bidsShown && !bidsSeen && bids.length > 0;

  function setupNeeded(): boolean {
    if (!userId) { router.push(`/join?next=/live/${sale.slug}`); return true; }
    if (v.profile?.suspended) { setMsg({ kind: "bad", text: "Your account can't bid at the moment. Call us if you think that's a mistake.", lot: curId ?? 0 }); return true; }
    if (v.missing.length) { router.push(`/join?step=${v.missing[0]}&next=/live/${sale.slug}`); return true; }
    if (v.profile?.terms_current === false) { router.push(`/lot/${curId}#bid`); return true; }
    return false;
  }
  async function place(amount: number) {
    if (!cur) return;
    setBusy(true); setMsg(null); setShort(null);
    const res = await fetch("/api/bid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: cur.id, max: amount }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false); setMaxOpen(false);
    if (res.status === 403 && data.code === "enter_first") { setEntered(false); setGateAck(false); return; }
    // a bid from the phone bar that needs more bidding deposit: bring the details (and the top-up) into view
    if (res.status === 402) { setShort({ need: data.need, have: data.have, amount }); if (!bidsSeen) consoleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (!res.ok) { setMsg({ kind: "bad", text: data.error || "That bid didn't go through. Try again.", lot: cur.id }); void load(); return; }
    setMyMax((m) => ({ ...m, [cur.id]: Math.max(m[cur.id] || 0, amount) }));
    applyLot({ id: cur.id, current_bid: data.current_bid, ends_at: data.ends_at, leader_id: data.status === "leading" ? userId : cur.leader_id, bid_count: cur.bid_count + 1 });
    const price = Number(data.current_bid);
    setMsg(data.status === "leading" ? { kind: "ok", text: `Bid placed. You're in front at ${money(price)}.`, lot: cur.id, price }
      : { kind: "bad", text: `Another bidder's maximum was higher, so the bid is now ${money(price)}. Bid again to get in front.`, lot: cur.id, price });
    void load();
  }
  // withdrawing a bid is allowed until the hammer falls; the countdown then gives the room a moment to answer
  async function withdraw() {
    if (!cur || !window.confirm("Withdraw your bid now? The price is worked out again without it.")) return;
    setBusy(true); setMsg(null);
    const res = await fetch("/api/bid", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: cur.id }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ kind: "bad", text: data.error || "Couldn't withdraw your bid.", lot: cur.id }); return; }
    setMyMax((m) => { const n = { ...m }; delete n[cur.id]; return n; });
    setMsg({ kind: "ok", text: "Your bid has been withdrawn.", lot: cur.id });
    void load();
  }
  // they accepted the conditions on entering, so a tap is a bid (the all-in is on the button)
  function tap(amount: number) {
    if (fresh || setupNeeded()) return;
    void place(amount);
  }

  const statusPill = sale.live_status === "running" ? <span className="lv-pill on" data-testid="live-status">Live now</span>
    : paused ? <span className="lv-pill paused" data-testid="live-status">Paused</span>
    : sale.live_status === "ended" ? <span className="lv-pill" data-testid="live-status">Finished</span>
    : <span className="lv-pill" data-testid="live-status">Starts {dateTime(sale.starts_at)}</span>;

  return (
    <div className={`lv${dock ? " docked" : ""}`}>
      <div className="lv-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
          <div className="pill-row" style={{ gap: 8 }}>{statusPill}{rt && sale.live_status === "running" && <span className="hint" style={{ margin: 0 }}>Updating live</span>}</div>
          <h1 className="d2" style={{ fontSize: "clamp(34px,5vw,60px)" }} data-testid="live-title">{sale.title}.</h1>
          {sale.auctioneer && <span className="lv-pill" style={{ alignSelf: "flex-start" }} data-testid="live-auctioneer">Auctioneer: {sale.auctioneer}</span>}
          <span className="muted">{[sale.seller_label, sale.state].filter(Boolean).join(" · ")}{licences ? `${sale.seller_label || sale.state ? " · " : ""}${licences}` : ""}</span>
        </div>
        <Link className="btn btn-soft lv-cal" href={`/calendar`} style={{ height: 44, fontSize: 14 }}>Auction calendar</Link>
      </div>

      {entered === null ? <p className="muted" style={{ margin: 0 }}>Opening the room…</p> : !entered ? (
        <section className="lv-gate" aria-labelledby="lv-gate-h" data-testid="live-gate">
          <div className="lv-gate-top">
            <h2 id="lv-gate-h" className="d3" style={{ fontSize: "clamp(28px,4vw,40px)" }}>Before you enter.</h2>
            <p className="muted" style={{ margin: 0, maxWidth: 640 }}>The conditions of this auction. They&apos;re the key points of our <Link className="blue" href="/terms" target="_blank" style={{ fontWeight: 700 }}>Terms of Sale</Link>, which apply to every vehicle sold here.</p>
          </div>
          <ul className="lv-conds">
            {conditions.map((c) => (
              <li key={c.head}><b>{c.head}</b> {c.text} <Link className="blue" href={`/terms#${c.terms}`} target="_blank" aria-label={`${c.head} In the Terms of Sale`}>Terms</Link></li>
            ))}
          </ul>
          <label className="lv-ack">
            <input type="checkbox" checked={gateAck} onChange={(e) => setGateAck(e.target.checked)} data-testid="live-gate-ack" />
            <span>{CONDITIONS_ACK}</span>
          </label>
          {gateErr && <div className="notice bad" role="alert">{gateErr}</div>}
          <div className="pill-row" style={{ gap: 14, alignItems: "center" }}>
            <button className="btn btn-blue" onClick={enter} disabled={!gateAck || entering} data-testid="live-gate-enter" style={{ minWidth: 240 }}>{entering ? "Opening the room…" : "Enter the auction"}</button>
            {!userId && <span className="hint" style={{ margin: 0 }}>You can watch without an account. To bid, sign in or join free: verify your mobile and ID once.</span>}
          </div>
        </section>
      ) : (<>
      {sale.live_message && sale.live_status !== "scheduled" && <div className={`lv-call${paused ? " paused" : closed && cur?.status === "sold" ? " sold" : ""}`} role="status" aria-live="assertive" data-testid="live-message">{sale.live_message}</div>}

      <div className="lv-grid">
        <div className="lv-stage">
          {(() => {
            // the vehicle that's up (or, before the start, the first one), named above its photos and the seller's video
            const shown = cur ?? room.next[0] ?? null;
            if (!shown) return <div className="lv-photo"><CarArt type="car" /></div>;
            const m = room.media && room.media.lot_id === shown.id ? room.media : null;
            return (
              <>
                <div className="lv-lot" data-testid="live-lot">
                  <span className="lv-lot-k">{cur ? lotNo(cur) : `${sale.live_status === "scheduled" ? "First up" : "Next up"} · ${lotNo(shown)}`}{open ? <span className="lv-upnow">Up now</span> : null}</span>
                  <b className="lv-lot-t">{shown.title}</b>
                  <span className="muted">{lotFacts(shown)}</span>
                </div>
                <LiveMedia lotId={shown.id} title={shown.title} category={shown.category} photos={m?.photos || (shown.cover_path ? [{ path: shown.cover_path, angle: null }] : [])} videos={m?.videos || []} externalVideo={m?.video_url} />
                <Link className="blue" href={`/lot/${shown.id}`} target="_blank" style={{ fontWeight: 700, alignSelf: "flex-start" }}>Full listing, condition report and photos ›</Link>
              </>
            );
          })()}
        </div>

        <div className="lv-console bidbox" data-testid="live-console" ref={consoleRef}>
          {cur ? (
            <>
              <div className="lv-est">
                {hasEstimate(cur) && <span data-testid="live-estimate">Estimate <b>{estimateText(cur)}</b> · all-in <b>{estimateAllInText(cur, lotFeesNow)}</b></span>}
                <span className="hint" style={{ margin: 0 }} data-testid="live-terms">{warrantySign(cur.statutory_warranty) ? <b>{warrantySign(cur.statutory_warranty)} </b> : null}{coolingOffSign(cur.state) ? <b>{coolingOffSign(cur.state)} </b> : null}{premiumLabel(lotFeesNow)}, plus GST and the admin fee, applies.</span>
              </div>
              {open || (cur.status === "sold" && !afterSold) ? (
                <div className="lv-price">
                  <span className="k">{cur.status === "sold" ? "Sold for" : "Current bid"}</span>
                  <span className="v" data-testid="live-price">{money(cur.status === "sold" ? cur.sold_price : cur.current_bid)}</span>
                  <span className="k">All-in</span><span className="v" data-testid="live-allin">{allInMoney(cur.status === "sold" ? soldAllIn : allIn)}</span>
                  <span className="hint" style={{ margin: 0 }}>With the buyer&apos;s premium, GST and admin fee · {cur.bid_count} bid{cur.bid_count === 1 ? "" : "s"}</span>
                </div>
              ) : (
                <div className="lv-price"><span className="k">Result</span><span className="v" style={{ fontSize: "clamp(30px,3.4vw,40px)", letterSpacing: "-0.03em" }} data-testid="live-price">{resultLine(cur).replace(/\.$/, "")}</span>
                  {cur.status === "passed" && !topPassed && <span className="hint" style={{ margin: "6px 0 0" }} data-testid="live-passed">{cur.bid_count ? "Bidding didn't reach the seller's reserve, so it wasn't sold and nobody owes anything." : "Nobody bid, so it wasn't sold."} It may be offered at a later auction.</span>}</div>
              )}
              {open && (
                <div className="lv-clock" aria-label={`${left} seconds left`}>
                  <div className="lv-bar"><i style={{ width: `${Math.min(100, (left / windowSecs) * 100)}%` }} className={left <= 5 ? "hot" : ""} /></div>
                  <span className={`lv-secs${left <= 5 ? " hot" : ""}`} data-testid="live-seconds">{paused ? "Paused" : left > 0 ? `${left}s` : "Closing…"}</span>
                </div>
              )}
              {open && <span className="lv-line" data-testid="live-line">{liveLine(sale, cur)}</span>}
              {open && userId && (leading || bidHere) ? (
                <span className={`tag ${leading ? "lv-win" : "lv-out"}`} data-testid="live-you">{leading ? "You're the highest bidder" : "You've been outbid"}</span>
              ) : null}
              {won ? (
                <div className="lv-result won" role="status" data-testid="live-won">
                  <b>You won it at {money(cur.sold_price)}.</b>
                  <span>{buyNowPayLine(priceBreakdown(Number(cur.sold_price) || 0, lotFeesNow)) || "Your invoice is in your account."}</span>
                  <Link className="btn btn-dark" href="/account#invoices" style={{ height: 48, fontSize: 15, alignSelf: "flex-start" }}>See your invoice</Link>
                </div>
              ) : closed && cur.status === "sold" && !afterSold && userId && bidHere ? (
                <div className="lv-result" role="status" data-testid="live-lost">
                  <b>Sold to another bidder.</b>
                  <span className="muted">Thanks for bidding. There&apos;s more coming up.</span>
                </div>
              ) : topPassed ? (
                <div className="lv-result top" role="status" data-testid="live-top-passed">
                  <b>You were the highest bidder.</b>
                  <span>Bidding didn&apos;t reach the seller&apos;s reserve, so it wasn&apos;t sold and you don&apos;t owe anything. One of our consultants will be in touch.</span>
                </div>
              ) : null}
              {note && <div className={`notice ${note.kind}`} role="status" data-testid="live-note">{note.text}</div>}
              {open && !paused && (
                <div className="lv-bids" ref={bidsRef}>
                  {bids.map((b, i) => (
                    <button key={b} className={`btn ${i === 0 ? "btn-blue" : "btn-soft"}`} onClick={() => tap(b)} disabled={busy || leading || fresh} data-testid={i === 0 ? "live-bid" : undefined}>
                      <span>Bid {money(b)}</span><small>{allInMoney(priceBreakdown(b, lotFeesNow).total)} all-in</small>
                    </button>
                  ))}
                  <button className="linkbtn" onClick={() => { if (!setupNeeded()) { setMaxAmount(String(nextBid(cur) + 1000)); setMaxOpen(true); } }}>Or set a maximum and we&apos;ll bid for you</button>
                </div>
              )}
              {open && !paused && userId && (leading || myMax[cur.id]) ? <button className="linkbtn" onClick={withdraw} disabled={busy} data-testid="live-withdraw">Withdraw my bid (allowed until the hammer falls)</button> : null}
              {short && <DepositShort need={short.need} have={short.have} amount={short.amount} lotId={cur.id} />}
              {!userId && open && <span className="hint" style={{ margin: 0 }}>Sign in (or join free: verify your mobile and ID once) to bid.</span>}
            </>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <b style={{ fontSize: 22 }}>{sale.live_status === "ended" ? "The sale has finished." : sale.live_status === "scheduled" ? `Starts ${dateTime(sale.starts_at)}.` : "Next vehicle coming up."}</b>
              <span className="muted">{sale.live_status === "ended" ? "Thanks for bidding. Results are below." : `${room.waiting} vehicle${room.waiting === 1 ? "" : "s"} to go. Each one is offered for about ${sale.lot_seconds} seconds, and every bid near the end resets the countdown to ${sale.extend_seconds} seconds. Bid early on any of them and we bid for you, up to your maximum, when it's offered.`}</span>
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

      </>)}

      <p className="hint lv-small" data-testid="live-rules">Only registered bidders (a verified mobile and ID) can bid. Each vehicle is sold under the hammer by Tyrebiter as agent for its owner: when the countdown ends, the highest bid buys it if it meets the reserve; if not, it&apos;s passed in and nobody owes anything. Each bid is binding unless you withdraw it before the hammer falls. The price shown is the bid before fees; the all-in amount is what you&apos;d pay. The seller can&apos;t bid, and we never bid for the seller. The auctioneer may also take bids by phone from registered bidders, and settles any dispute about a bid from the bids recorded here (Terms of Sale, section 6). Vehicles are sold as is, where is: check the seller&apos;s photos and video, and order a mechanical inspection before the sale if you want one.</p>

      {dock && cur && (
        <div className="lv-dock" role="region" aria-label="Bid on the vehicle that's up" data-testid="live-dock">
          <div className="lv-dock-top">
            {bidHere && !leading ? <span className="tag lv-out">Outbid</span> : null}
            <span className="lv-dock-name" data-testid="live-dock-name">{lotNo(cur)} · {cur.title}</span>
            <span className={`lv-dock-secs${left <= 5 ? " hot" : ""}`}>{left > 0 ? `${left}s` : "Closing"}</span>
          </div>
          <div className="lv-bar"><i style={{ width: `${Math.min(100, (left / windowSecs) * 100)}%` }} className={left <= 5 ? "hot" : ""} /></div>
          <div className="lv-dock-row">
            <div className="lv-dock-price">
              <span><b>{money(cur.current_bid)}</b> {cur.bid_count ? "bid" : "to start"}</span>
              <span><b>{allInMoney(allIn)}</b> all-in</span>
            </div>
            {leading ? <span className="lv-dock-lead" data-testid="live-dock-lead">You&apos;re in front</span> : (
              <button className="btn btn-blue" onClick={() => tap(bids[0])} disabled={busy || fresh} data-testid="live-dock-bid">
                <span>Bid {money(bids[0])}</span><small>{allInMoney(priceBreakdown(bids[0], lotFeesNow).total)} all-in</small>
              </button>
            )}
          </div>
          {note && note.kind === "bad" && note.price == null ? <span className="lv-dock-err" role="alert">{note.text}</span> : null}
        </div>
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
          onPlace={() => { const n = maxStage; setMaxStage(null); void place(n); }} onClose={() => setMaxStage(null)} withdrawable />
      )}
    </div>
  );

}
