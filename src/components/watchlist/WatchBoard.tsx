"use client";
/* eslint-disable @next/next/no-img-element -- listing photos are served from storage at their own sizes, like the rest of the site */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Fees, Grade, Lot, LotStatus } from "@/lib/types";
import type { VehicleType } from "@/lib/vehicles";
import { supabaseBrowser } from "@/lib/supabase/client";
import { priceBreakdown, lotFees } from "@/lib/fees";
import { bidIncrement, dateTime, money } from "@/lib/format";
import { CarArt } from "@/components/CarArt";
import { Countdown } from "@/components/Countdown";
import { Modal } from "@/components/Modal";
import { BidConfirm } from "@/components/BidConfirm";
import { RemindSwitch, WatchNote } from "@/components/WatchRowControls";
import { useViewer } from "@/components/Viewer";

// The watchlist: every vehicle you're watching or have bid on. Prices, bids and times update live (Realtime
// Broadcast on lot:<id>, the same as the vehicle page, with a slow edge-cached re-check), the vehicle closing next
// gets the big card, outbids are pulled to the top, and you can bid or raise your maximum without leaving the page.
// Every price has its all-in amount beside it.

export type WatchItem = {
  id: number; title: string; status: LotStatus; ends_at: string | null; current_bid: number; bid_count: number; start_price: number;
  reserve_met: boolean; has_reserve: boolean; leader_id: string | null; winner_id: string | null; sold_price: number | null; decision_by: string | null;
  buy_now_price: number | null; seller_type: Lot["seller_type"] | null; fees: Lot["fees"] | null; backdrop: string; vehicle_type: VehicleType;
  cover: string | null; place: string; spec: string; year: number | null; grade: Grade | null; is_seller: boolean;
  my_max: number | null; watched: boolean; remind: boolean; note: string | null; added_at: string | null;
};
type LiveKeys = "status" | "ends_at" | "current_bid" | "bid_count" | "reserve_met" | "leader_id" | "winner_id" | "sold_price" | "decision_by" | "buy_now_price";
type Status = { k: "winning" | "outbid" | "watch" | "won" | "lost" | "sold" | "referred" | "offers" | "passed" | "ended"; t: string; tone: string };

const TABS: [string, string][] = [["all", "All"], ["soon", "Ending today"], ["winning", "Winning"], ["outbid", "Outbid"], ["won", "Won"], ["lost", "Didn't win"]];
const SORTS: [string, string][] = [["ending", "Ending soonest"], ["added", "Recently added"], ["low", "Lowest price"], ["high", "Highest price"]];
const LIVE_KEYS: LiveKeys[] = ["status", "ends_at", "current_bid", "bid_count", "reserve_met", "leader_id", "winner_id", "sold_price", "decision_by", "buy_now_price"];

const endsMs = (i: WatchItem) => (i.ends_at ? new Date(i.ends_at).getTime() : 0);
const isLive = (i: WatchItem, now: number) => i.status === "live" && (!i.ends_at || endsMs(i) > now);
export const nextBid = (i: Pick<WatchItem, "bid_count" | "start_price" | "current_bid">) =>
  i.bid_count === 0 ? Math.max(i.start_price, i.current_bid) : i.current_bid + bidIncrement(i.current_bid);

export function statusOf(i: WatchItem, userId: string, now: number): Status {
  const bid = i.my_max != null;
  if (i.status === "sold") return i.winner_id === userId ? { k: "won", t: "You won", tone: "var(--mint)" } : { k: bid ? "lost" : "sold", t: bid ? "Didn't win" : "Sold", tone: "var(--panel2)" };
  if (i.status === "referred") return i.leader_id === userId ? { k: "referred", t: "Your bid is with the seller", tone: "var(--sun)" } : { k: bid ? "lost" : "referred", t: "Referred to the seller", tone: "var(--panel2)" };
  if (i.status === "offers") return { k: "offers", t: "Offers open", tone: "var(--sun)" };
  if (i.status === "passed") return { k: bid ? "lost" : "passed", t: "Passed in", tone: "var(--panel2)" };
  if (!isLive(i, now)) return { k: "ended", t: "Closing", tone: "var(--panel2)" };
  if (!bid) return { k: "watch", t: "Not bid yet", tone: "#FFFFFF" };
  return i.leader_id === userId ? { k: "winning", t: "You're winning", tone: "var(--mint)" } : { k: "outbid", t: "Outbid", tone: "var(--berry)" };
}

const reserveChip = (i: WatchItem) => !i.has_reserve ? { t: "No reserve", tone: "var(--lilac)" } : i.reserve_met ? { t: "Reserve met", tone: "var(--mint)" } : { t: "Reserve not met", tone: "var(--sun)" };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function WatchBoard({ items, fees, userId, initialTab, initialSort }: { items: WatchItem[]; fees: Fees; userId: string; initialTab: string; initialSort: string }) {
  const v = useViewer();
  const router = useRouter();
  const [list, setList] = useState<WatchItem[]>(items);
  const [tab, setTab] = useState(TABS.some(([k]) => k === initialTab) ? initialTab : "all");
  const [sort, setSort] = useState(SORTS.some(([k]) => k === initialSort) ? initialSort : "ending");
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [compare, setCompare] = useState<number[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [bidding, setBidding] = useState<WatchItem | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setList(items); }, [items]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const say = useCallback((text: string, undo?: () => void) => {
    setToast({ text, undo });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), undo ? 8000 : 6000);
  }, []);

  // ---- live prices: one Broadcast channel per live vehicle (the soonest 40), plus a slow edge-cached re-check
  const apply = useCallback((id: number, next: Partial<WatchItem>) => {
    setList((prev) => prev.map((i) => {
      if (i.id !== id) return i;
      if (next.bid_count != null && next.bid_count < i.bid_count && (next.status ?? i.status) === i.status) return i; // never go backwards
      const merged = { ...i };
      for (const k of LIVE_KEYS) if (next[k] !== undefined) (merged as Record<string, unknown>)[k] = next[k];
      if (next.current_bid != null) merged.current_bid = Number(next.current_bid);
      return merged;
    }));
  }, []);
  const liveIds = useMemo(() => list.filter((i) => i.status === "live").sort((a, b) => endsMs(a) - endsMs(b)).slice(0, 40).map((i) => i.id).join(","), [list]);
  useEffect(() => {
    const ids = liveIds ? liveIds.split(",").map(Number) : [];
    if (!ids.length) return;
    const db = supabaseBrowser();
    const subscribed = new Set<number>();
    const channels = ids.map((id) => db.channel(`lot:${id}`, { config: { private: false } })
      .on("broadcast", { event: "lot" }, ({ payload }: { payload: Partial<WatchItem> }) => apply(id, payload))
      .subscribe((s: string) => { if (s === "SUBSCRIBED") subscribed.add(id); else subscribed.delete(id); }));
    const check = async (id: number) => {
      try { const r = await fetch(`/api/lots/${id}/live`, { cache: "no-store" }); if (r.ok) apply(id, await r.json()); } catch { /* offline for a moment */ }
    };
    let round = 0;
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      round += 1;
      // without Realtime: every 15 s; with it, a safety re-check every 2 minutes
      for (const id of ids) if (!subscribed.has(id) || round % 8 === 0) void check(id);
    }, 15_000);
    const onVis = () => { if (document.visibilityState === "visible") ids.forEach((id) => void check(id)); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); channels.forEach((c) => db.removeChannel(c)); };
  }, [liveIds, apply]);

  // ---- what's shown
  const visible = list.filter((i) => i.watched || i.my_max != null);
  const st = (i: WatchItem) => statusOf(i, userId, now);
  const soon = (i: WatchItem) => isLive(i, now) && endsMs(i) - now < 86_400_000;
  const inTab = (i: WatchItem) => tab === "all" || (tab === "soon" ? soon(i) : st(i).k === tab);
  const counts: Record<string, number> = { all: visible.length, soon: visible.filter(soon).length };
  for (const k of ["winning", "outbid", "won", "lost"]) counts[k] = visible.filter((i) => st(i).k === k).length;
  const price = (i: WatchItem) => (i.status === "sold" ? Number(i.sold_price || 0) : i.current_bid);
  const order = (a: WatchItem, b: WatchItem) =>
    sort === "added" ? String(b.added_at || "").localeCompare(String(a.added_at || ""))
      : sort === "low" ? price(a) - price(b) : sort === "high" ? price(b) - price(a) : endsMs(a) - endsMs(b);
  const shown = visible.filter(inTab);
  const live = shown.filter((i) => isLive(i, now)).sort(order);
  const finished = shown.filter((i) => !isLive(i, now)).sort((a, b) => (sort === "ending" ? endsMs(b) - endsMs(a) : order(a, b)));
  const next = (tab === "all" || tab === "soon") && sort === "ending" ? live[0] : undefined;
  const rest = next ? live.slice(1) : live;
  const outbid = tab === "all" ? visible.filter((i) => st(i).k === "outbid").sort((a, b) => endsMs(a) - endsMs(b)) : [];
  const liveCount = visible.filter((i) => isLive(i, now)).length;

  const pickTab = (k: string) => { setTab(k); const u = new URL(window.location.href); u.searchParams.set("f", k); window.history.replaceState(null, "", u); };
  const pickSort = (k: string) => { setSort(k); const u = new URL(window.location.href); u.searchParams.set("sort", k); window.history.replaceState(null, "", u); };

  // ---- actions
  const canBid = (i: WatchItem) => !!v.user && v.missing.length === 0 && v.profile?.terms_current !== false && !i.is_seller;
  async function remove(i: WatchItem) {
    const res = await fetch("/api/watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: i.id, on: false }) });
    if (!res.ok) { say("Couldn't remove it. Try again."); return; }
    setList((prev) => prev.map((x) => (x.id === i.id ? { ...x, watched: false } : x)));
    setCompare((c) => c.filter((x) => x !== i.id));
    v.setWatched(i.id, false);
    say(`Removed ${i.title} from your watchlist.`, async () => {
      await fetch("/api/watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: i.id, on: true }) });
      if (i.remind) await fetch("/api/watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: i.id, remind: true }) });
      if (i.note) await supabaseBrowser().from("watchlist").update({ note: i.note }).eq("lot_id", i.id);
      setList((prev) => prev.map((x) => (x.id === i.id ? { ...x, watched: true } : x)));
      v.setWatched(i.id, true);
      say("Back on your watchlist.");
    });
  }
  const toggleCompare = (id: number) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length >= 3 ? c : [...c, id]));
  const onBidPlaced = (i: WatchItem, max: number, data: { status: string; current_bid: number; ends_at: string; extended?: boolean }) => {
    setList((prev) => prev.map((x) => (x.id === i.id ? { ...x, my_max: max, current_bid: Number(data.current_bid), ends_at: data.ends_at || x.ends_at,
      bid_count: x.bid_count + 1, leader_id: data.status === "leading" ? userId : x.leader_id === userId ? null : x.leader_id } : x)));
    say(data.status === "leading"
      ? `You're winning ${i.title} at ${money(data.current_bid)}. We'll bid for you up to ${money(max)}.${data.extended ? " The auction was extended by 10 minutes." : ""}`
      : `Another bidder's maximum is higher. The bid on ${i.title} is now ${money(data.current_bid)}.`);
  };

  const summary = [
    visible.length ? `${plural(visible.length, "vehicle")}, ${liveCount} still live` : "",
    counts.soon ? `${counts.soon} ending today` : "",
    counts.winning ? `you're winning ${counts.winning}` : "",
    counts.outbid ? `outbid on ${counts.outbid}` : "",
  ].filter(Boolean).join(", ");

  return (
    <div className="wl" data-testid="watchboard">
      <div className="wl-head">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <h1 className="d2">Watchlist.</h1>
          <p className="muted" style={{ margin: 0, fontSize: 17 }} data-testid="wl-summary">{summary ? `${summary[0].toUpperCase()}${summary.slice(1)}.` : "Nothing yet."}</p>
        </div>
        <label className="wl-sort"><span className="muted">Sort</span>
          <select className="input" value={sort} onChange={(e) => pickSort(e.target.value)} aria-label="Sort the watchlist">{SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
      </div>

      {outbid.length > 0 && (
        <div className="wl-out" role="region" aria-label="Vehicles you've been outbid on" data-testid="wl-outbid">
          <b style={{ fontSize: 17 }}>You&apos;ve been outbid on {plural(outbid.length, "vehicle")}.</b>
          {outbid.slice(0, 3).map((i) => (
            <div className="wl-out-row" key={i.id}>
              <Link href={`/lot/${i.id}`} className="t">{i.title}</Link>
              <span className="muted">Now {money(i.current_bid)} · your max {money(i.my_max)} · <Countdown endsAt={i.ends_at} /></span>
              <BidButton i={i} can={canBid(i)} onOpen={() => setBidding(i)} small />
            </div>
          ))}
          {outbid.length > 3 && <button className="linkbtn" style={{ alignSelf: "flex-start", fontSize: 14 }} onClick={() => pickTab("outbid")}>See all {outbid.length}</button>}
        </div>
      )}

      <div className="seg" role="tablist" aria-label="Show" style={{ alignSelf: "flex-start" }}>
        {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => pickTab(k)} data-testid={`wl-tab-${k}`}>{l} <span className="wl-n">{counts[k]}</span></button>)}
      </div>

      {shown.length === 0 && (
        <div className="empty">
          <b style={{ fontSize: 22 }}>{tab === "all" ? "Your watchlist is empty." : "Nothing here right now."}</b>
          <span className="muted">{tab === "all" ? "Tap the heart on any vehicle to follow it here. Its price and time left update as bids come in." : "Try another tab."}</span>
          {tab === "all" && <Link className="btn btn-blue" href="/auctions">Browse auctions</Link>}
        </div>
      )}

      {next && (
        <article className="wl-next" data-testid="wl-next" aria-label={`Closing next: ${next.title}`}>
          <Link href={`/lot/${next.id}`} className={`stage bg-${next.backdrop}`} aria-label={next.title} tabIndex={-1}>
            {next.cover ? <img className="lotimg" src={next.cover} alt="" /> : <CarArt type={next.vehicle_type} />}
          </Link>
          <div className="wl-next-body">
            <span className="muted" style={{ fontWeight: 700 }}>Closing next</span>
            <Link href={`/lot/${next.id}`} className="wl-next-title">{next.title}</Link>
            <span className="muted">{[next.place, next.spec].filter(Boolean).join(" · ")}</span>
            <Countdown endsAt={next.ends_at} className={`wl-clock${endsMs(next) - now < 3_600_000 ? " soon" : ""}`} />
            <span className="muted" style={{ fontSize: 14 }}>Ends {dateTime(next.ends_at)}</span>
            <PriceBlock i={next} fees={fees} big />
            <div className="wl-chips"><Chips i={next} status={st(next)} /></div>
            <div className="wl-next-act">
              <BidButton i={next} can={canBid(next)} onOpen={() => setBidding(next)} />
              {next.watched && <RemindSwitch lotId={next.id} initial={next.remind} />}
            </div>
            {next.watched && <WatchNote lotId={next.id} initial={next.note || ""} />}
          </div>
        </article>
      )}

      {rest.length > 0 && (
        <section className="wl-list" aria-label="Live">
          {rest.map((i) => <Row key={i.id} i={i} fees={fees} status={st(i)} now={now} can={canBid(i)} onBid={() => setBidding(i)} onRemove={() => remove(i)}
            comparing={compare.includes(i.id)} onCompare={() => toggleCompare(i.id)} compareFull={compare.length >= 3} />)}
        </section>
      )}

      {finished.length > 0 && (
        <section className="wl-list" aria-label="Finished">
          <h2 className="wl-h2">Finished</h2>
          {finished.map((i) => <Finished key={i.id} i={i} status={st(i)} onRemove={() => remove(i)} />)}
        </section>
      )}

      {compare.length > 0 && (
        <div className="wl-bar" role="region" aria-label="Compare">
          <span><b>{plural(compare.length, "vehicle")}</b> to compare{compare.length >= 3 ? " (that's the most)" : ""}</span>
          <span style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-white" style={{ height: 42, fontSize: 14 }} onClick={() => setCompare([])}>Clear</button>
            <button className="btn btn-blue" style={{ height: 42, fontSize: 14 }} disabled={compare.length < 2} onClick={() => setCompareOpen(true)} data-testid="wl-compare-open">Compare</button>
          </span>
        </div>
      )}
      {compareOpen && <Compare items={compare.map((id) => list.find((i) => i.id === id)!).filter(Boolean)} fees={fees} userId={userId} now={now} onClose={() => setCompareOpen(false)} />}

      {bidding && (
        <QuickBid i={list.find((x) => x.id === bidding.id) || bidding} fees={fees} cardLabel={v.profile?.card_brand ? `${v.profile.card_brand} ending ${v.profile.card_last4}` : null}
          onClose={() => setBidding(null)} onPlaced={onBidPlaced} onTerms={() => { setBidding(null); router.push(`/lot/${bidding.id}`); }} />
      )}

      {toast && (
        <div className="wl-toast" role="status" data-testid="wl-toast">
          <span>{toast.text}</span>
          {toast.undo && <button className="linkbtn" style={{ color: "#FFFFFF" }} onClick={() => { const u = toast.undo!; setToast(null); void u(); }}>Undo</button>}
        </div>
      )}
    </div>
  );
}

function PriceBlock({ i, fees, big }: { i: WatchItem; fees: Fees; big?: boolean }) {
  const sold = i.status === "sold";
  const base = sold ? Number(i.sold_price || 0) : Math.max(i.current_bid || 0, i.start_price || 0);
  const allIn = priceBreakdown(base, lotFees(fees, i)).total;
  return (
    <div className={`wl-price${big ? " big" : ""}`}>
      <span className="muted">{sold ? "Sold for" : i.bid_count ? "Current bid" : "Starting bid"}</span>
      <b data-testid={`wl-bid-${i.id}`}>{money(sold ? i.sold_price : i.bid_count ? i.current_bid : base)}</b>
      {!sold && <span className="wl-allin" data-testid={`wl-allin-${i.id}`}>{money(allIn, true)} all-in with fees</span>}
      <span className="muted" style={{ fontSize: 13 }}>{plural(i.bid_count, "bid")}{i.my_max != null && !sold ? ` · your max ${money(i.my_max)}` : ""}</span>
    </div>
  );
}

function Chips({ i, status }: { i: WatchItem; status: Status }) {
  const r = reserveChip(i);
  return (
    <>
      <span className="tag" style={{ background: status.tone, color: status.k === "outbid" ? "#FFFFFF" : undefined }} data-testid={`wl-status-${i.id}`}>{status.t}</span>
      {i.status === "live" && <span className="tag" style={{ background: r.tone }}>{r.t}</span>}
      {i.status === "live" && i.buy_now_price && i.current_bid < i.buy_now_price && <span className="tag" style={{ background: "var(--lime)" }}>Buy now {money(i.buy_now_price)}</span>}
    </>
  );
}

function BidButton({ i, can, onOpen, small }: { i: WatchItem; can: boolean; onOpen: () => void; small?: boolean }) {
  const n = nextBid(i);
  const style = small ? { height: 40, fontSize: 14, padding: "0 16px" } : { height: 48, fontSize: 15 };
  if (i.is_seller) return <span className="hint">Your vehicle</span>;
  if (!can) return <Link className="btn btn-blue" style={style} href={`/lot/${i.id}`}>Place bid</Link>;
  return <button className="btn btn-blue" style={style} onClick={onOpen} data-testid={`wl-bidbtn-${i.id}`}>{`Bid ${money(n)}`}</button>;
}

function Row({ i, fees, status, now, can, onBid, onRemove, comparing, onCompare, compareFull }: {
  i: WatchItem; fees: Fees; status: Status; now: number; can: boolean; onBid: () => void; onRemove: () => void; comparing: boolean; onCompare: () => void; compareFull: boolean;
}) {
  const lastHour = endsMs(i) - now < 3_600_000;
  const winning = status.k === "winning";
  return (
    <article className="wl-row" data-testid={`wl-row-${i.id}`}>
      <Link href={`/lot/${i.id}`} className={`stage bg-${i.backdrop}`} aria-label={i.title} tabIndex={-1}>
        {i.cover ? <img className="lotimg" src={i.cover} alt="" /> : <CarArt type={i.vehicle_type} />}
      </Link>
      <div className="wl-main">
        <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Lot {i.id}{i.place ? `, ${i.place}` : ""}</span>
        <Link href={`/lot/${i.id}`} className="wl-title">{i.title}</Link>
        {i.spec && <span className="muted" style={{ fontSize: 14 }}>{i.spec}{i.grade ? ` · Visual grade ${i.grade}` : ""}</span>}
        <div className="wl-chips"><Chips i={i} status={status} /></div>
        {i.watched && <WatchNote lotId={i.id} initial={i.note || ""} />}
      </div>
      <div className="wl-time">
        <span className="muted" style={{ fontSize: 13, fontWeight: 600 }}>Ends in</span>
        <Countdown endsAt={i.ends_at} className={`wl-clock-sm${lastHour ? " soon" : ""}`} />
        <span className="muted" style={{ fontSize: 13 }}>{dateTime(i.ends_at)}</span>
      </div>
      <PriceBlock i={i} fees={fees} />
      <div className="wl-act">
        {winning && can ? <button className="btn btn-white" style={{ height: 46, fontSize: 15 }} onClick={onBid}>Raise max</button> : <BidButton i={i} can={can} onOpen={onBid} />}
        <div className="wl-act-row">
          {i.watched ? <RemindSwitch lotId={i.id} initial={i.remind} /> : <span className="hint">You bid on this</span>}
        </div>
        <div className="wl-act-row">
          <label className="wl-cmp"><input type="checkbox" checked={comparing} disabled={!comparing && compareFull} onChange={onCompare} /> Compare</label>
          {i.watched && <button className="linkbtn" style={{ color: "var(--muted)", fontWeight: 600, fontSize: 14 }} onClick={onRemove} aria-label={`Remove ${i.title} from watchlist`}>Remove</button>}
        </div>
      </div>
    </article>
  );
}

function Finished({ i, status, onRemove }: { i: WatchItem; status: Status; onRemove: () => void }) {
  const result = status.k === "won" ? `You won it for ${money(i.sold_price)}`
    : i.status === "sold" ? `Sold for ${money(i.sold_price)}`
    : i.status === "referred" ? `Highest bid ${money(i.current_bid)}, with the seller`
    : i.status === "offers" ? `Highest bid ${money(i.current_bid)}. Offers are open`
    : i.status === "passed" ? `Passed in at ${money(i.current_bid)}`
    : `Closed at ${money(i.current_bid)}. Working out the result`;
  return (
    <article className="wl-fin" data-testid={`wl-fin-${i.id}`}>
      <Link href={`/lot/${i.id}`} className={`stage bg-${i.backdrop}`} aria-label={i.title} tabIndex={-1}>
        {i.cover ? <img className="lotimg" src={i.cover} alt="" /> : <CarArt type={i.vehicle_type} />}
      </Link>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
        <Link href={`/lot/${i.id}`} className="wl-title" style={{ fontSize: 18 }}>{i.title}</Link>
        <span className="muted" style={{ fontSize: 14 }}>{result}{i.ends_at ? `. Ended ${dateTime(i.ends_at)}` : ""}</span>
      </div>
      <span className="tag" style={{ background: status.tone }}>{status.t}</span>
      <span style={{ display: "flex", gap: 14, alignItems: "center", justifyContent: "flex-end" }}>
        {status.k === "won" ? <Link className="btn btn-dark" style={{ height: 42, fontSize: 14 }} href="/account#invoices">View invoice</Link>
          : status.k === "offers" ? <Link className="btn btn-blue" style={{ height: 42, fontSize: 14 }} href={`/lot/${i.id}`}>Make an offer</Link>
          : <Link className="btn btn-white" style={{ height: 42, fontSize: 14 }} href={`/lot/${i.id}`}>View</Link>}
        {i.watched && <button className="linkbtn" style={{ color: "var(--muted)", fontWeight: 600, fontSize: 14 }} onClick={onRemove} aria-label={`Remove ${i.title} from watchlist`}>Remove</button>}
      </span>
    </article>
  );
}

function QuickBid({ i, fees, cardLabel, onClose, onPlaced, onTerms }: {
  i: WatchItem; fees: Fees; cardLabel: string | null; onClose: () => void;
  onPlaced: (i: WatchItem, max: number, data: { status: string; current_bid: number; ends_at: string; extended?: boolean }) => void; onTerms: () => void;
}) {
  const f = useMemo(() => lotFees(fees, i), [fees, i]);
  const min = nextBid(i);
  const raising = i.my_max != null && i.my_max >= min;
  const [amount, setAmount] = useState(String(raising ? (i.my_max as number) + bidIncrement(i.my_max as number) : min));
  const [stage, setStage] = useState<"amount" | "confirm">("amount");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const typed = Number(String(amount).replace(/[^0-9]/g, "")) || 0;
  const floor = raising ? Math.max(min, (i.my_max as number) + 1) : min;
  async function place() {
    setBusy(true); setErr("");
    const res = await fetch("/api/bid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: i.id, max: typed }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (res.status === 409) { onTerms(); return; }
    if (!res.ok) { setErr(data.error || "That bid didn't go through."); setStage("amount"); return; }
    onPlaced(i, typed, data);
    onClose();
  }
  if (stage === "confirm") return <BidConfirm lot={{ title: i.title, seller_type: i.seller_type ?? null }} typed={typed} minNext={min} fees={f} cardLabel={cardLabel} busy={busy} onPlace={place} onClose={() => setStage("amount")} />;
  const preview = priceBreakdown(typed || min, f);
  return (
    <Modal title={raising ? "Raise your maximum" : "Your maximum bid"} onClose={onClose}>
      <p className="muted" style={{ margin: 0 }}>{i.title}. Current bid {money(i.current_bid)}{raising ? `, your max ${money(i.my_max)}` : ""}. <Countdown endsAt={i.ends_at} /> left.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (typed < floor) { setErr(`Enter ${money(floor)} or more.`); return; } setErr(""); setStage("confirm"); }} style={{ display: "flex", flexDirection: "column", gap: 12 }} noValidate>
        <label className="field"><span>Your maximum</span>
          <span className="moneyin"><span className="muted">$</span><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby="qbhelp" data-testid="wl-bid-amount" /></span>
          <span className="hint" id="qbhelp">Minimum {money(floor)}. We bid for you, one increment at a time, only as far as needed. If you win at {money(typed || min)} you pay {money(preview.total, true)} all-in.</span>
        </label>
        {err && <div className="notice bad" role="status">{err}</div>}
        <button className="btn btn-blue" data-testid="wl-bid-review">Review bid</button>
        <button type="button" className="btn btn-soft" onClick={onClose}>Cancel</button>
      </form>
    </Modal>
  );
}

function Compare({ items, fees, userId, now, onClose }: { items: WatchItem[]; fees: Fees; userId: string; now: number; onClose: () => void }) {
  const rows: [string, (i: WatchItem) => React.ReactNode][] = [
    ["Current bid", (i) => money(i.status === "sold" ? i.sold_price : i.current_bid)],
    ["All-in with fees", (i) => money(priceBreakdown(Math.max(i.current_bid || 0, i.start_price || 0), lotFees(fees, i)).total, true)],
    ["Ends", (i) => (isLive(i, now) ? <><Countdown endsAt={i.ends_at} /><br /><span className="muted">{dateTime(i.ends_at)}</span></> : "Ended")],
    ["Details", (i) => i.spec || "–"],
    ["Year", (i) => i.year || "–"],
    ["Location", (i) => i.place || "–"],
    ["Visual grade", (i) => i.grade || "–"],
    ["Reserve", (i) => reserveChip(i).t],
    ["Bids", (i) => i.bid_count],
    ["You", (i) => statusOf(i, userId, now).t],
  ];
  return (
    <Modal title="Compare" onClose={onClose}>
      <div style={{ overflowX: "auto" }} data-testid="wl-compare">
        <table className="wl-ctable">
          <thead><tr><th scope="col"><span className="hide">Vehicle</span></th>{items.map((i) => (
            <th scope="col" key={i.id}>
              <Link href={`/lot/${i.id}`} className={`stage bg-${i.backdrop}`} aria-label={i.title}>{i.cover ? <img className="lotimg" src={i.cover} alt="" /> : <CarArt type={i.vehicle_type} />}</Link>
              <Link href={`/lot/${i.id}`} className="blue" style={{ fontWeight: 800 }}>{i.title}</Link>
            </th>))}</tr></thead>
          <tbody>{rows.map(([label, cell]) => <tr key={label}><th scope="row">{label}</th>{items.map((i) => <td key={i.id}>{cell(i)}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <button className="btn btn-soft" onClick={onClose}>Close</button>
    </Modal>
  );
}
