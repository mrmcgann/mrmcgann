"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Fees, Lot } from "@/lib/types";
import { priceBreakdown } from "@/lib/fees";
import { bidIncrement, dateLong, dateTime, money } from "@/lib/format";
import { Countdown } from "@/components/Countdown";
import { WatchButton } from "@/components/WatchButton";
import { Modal } from "@/components/Modal";

type Live = Pick<Lot, "status" | "current_bid" | "bid_count" | "ends_at" | "reserve_met" | "leader_id" | "decision_by" | "winner_id" | "sold_price" | "buy_now_price">;
type Hist = { amount: number; created_at: string; bidder_tag: string; bidder_mask?: string; is_auto: boolean }[];

const STEP_NAMES: Record<number, string> = { 2: "Your details", 3: "Verify mobile", 4: "Payment card", 5: "Verify ID" };
const pick = (x: Partial<Live>): Partial<Live> => {
  const o: Partial<Live> = {};
  for (const k of ["status", "current_bid", "bid_count", "ends_at", "reserve_met", "leader_id", "decision_by", "winner_id", "sold_price", "buy_now_price"] as const) {
    if (x[k] !== undefined) (o as Record<string, unknown>)[k] = x[k];
  }
  return o;
};

// Live price, bidding, Buy Now and offers for one vehicle.
// Updates arrive by Supabase Realtime Broadcast (one message fanned out to every
// viewer). If Realtime isn't connected, it polls an edge-cached endpoint instead,
// faster in the final two minutes. Nothing here reloads the page on each bid.
export function BidPanel(props: {
  lot: Lot; fees: Fees; userId: string | null; missing: number[]; cardLabel: string | null; termsCurrent: boolean;
  myMax: number | null; watched: boolean; invoiceId: string | null; lastOffer: { amount: number; status: string } | null;
  isSeller: boolean; history: Hist;
}) {
  const { lot, fees, userId, missing, cardLabel } = props;
  const router = useRouter();
  const [live, setLive] = useState<Live>(lot);
  const [skew, setSkew] = useState(0); // server clock minus this device's clock
  const [rt, setRt] = useState(false);
  const [myMax, setMyMax] = useState(props.myMax);
  const [leaderIsMe, setLeaderIsMe] = useState(!!props.userId && lot.leader_id === props.userId);
  const minNext = live.bid_count === 0 ? Math.max(lot.start_price, live.current_bid) : live.current_bid + bidIncrement(live.current_bid);
  const [amount, setAmount] = useState(String(minNext));
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [sure, setSure] = useState(false);
  const [ack, setAck] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [history, setHistory] = useState<Hist>(props.history);
  const lastCount = useRef(lot.bid_count);
  const lastStatus = useRef(lot.status);

  const apply = useCallback((next: Partial<Live> & { server_time?: string }) => {
    if (next.server_time) setSkew(new Date(next.server_time).getTime() - Date.now());
    setLive((prev) => {
      const merged = { ...prev, ...pick(next) };
      // never go backwards if an older cached response arrives after a newer broadcast
      if (Number(next.bid_count ?? prev.bid_count) < prev.bid_count && merged.status === prev.status) return prev;
      return merged;
    });
    if (next.leader_id !== undefined && props.userId) setLeaderIsMe(next.leader_id === props.userId);
  }, [props.userId]);

  const sync = useCallback(async () => {
    try {
      const r = await fetch(`/api/lots/${lot.id}/live`, { cache: "no-store" });
      if (r.ok) apply(await r.json());
    } catch { /* offline for a moment: keep what we have */ }
  }, [lot.id, apply]);

  // Realtime subscription + first sync
  useEffect(() => {
    const db = supabaseBrowser();
    const ch = db.channel(`lot:${lot.id}`, { config: { private: false } })
      .on("broadcast", { event: "lot" }, ({ payload }: { payload: Partial<Live> }) => apply(payload))
      .subscribe((status: string) => {
        setRt(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void sync();
      });
    void sync();
    const onVis = () => { if (document.visibilityState === "visible") void sync(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); db.removeChannel(ch); };
  }, [lot.id, apply, sync]);

  // Polling fallback (and a slow safety re-sync when Realtime is up)
  const endsMs = live.ends_at ? new Date(live.ends_at).getTime() - skew : 0;
  useEffect(() => {
    const leftMs = endsMs - Date.now();
    const every = rt ? 30_000 : leftMs < 120_000 ? 2_000 : 5_000;
    const t = setInterval(() => { if (document.visibilityState === "visible") void sync(); }, every);
    return () => clearInterval(t);
  }, [rt, endsMs, sync]);

  // Refresh the bid history when the bid count changes (edge-cached, debounced)
  useEffect(() => {
    if (live.bid_count === lastCount.current) return;
    lastCount.current = live.bid_count;
    const t = setTimeout(async () => {
      try { const r = await fetch(`/api/lots/${lot.id}/history`); if (r.ok) setHistory(await r.json()); } catch {}
    }, 600);
    return () => clearTimeout(t);
  }, [live.bid_count, lot.id]);

  // When the auction itself changes state (closed, sold, referred), reload the page once.
  useEffect(() => {
    if (live.status !== lastStatus.current) { lastStatus.current = live.status; router.refresh(); }
  }, [live.status, router]);

  // Keep the suggested amount at or above the minimum as bids come in
  useEffect(() => {
    setAmount((a) => (Number(String(a).replace(/[^0-9]/g, "")) < minNext ? String(minNext) : a));
  }, [minNext]);

  const endsAtAdjusted = live.ends_at ? new Date(endsMs).toISOString() : null;
  const ended = live.status !== "live" || (live.ends_at ? endsMs <= Date.now() : false);
  const leading = leaderIsMe;
  const typed = Number(String(amount).replace(/[^0-9]/g, "")) || 0;
  const preview = useMemo(() => priceBreakdown(typed || minNext, fees), [typed, minNext, fees]);
  const bigJump = typed >= 50_000 || (typed > minNext * 2 && typed - minNext >= 2_000);
  const payNote = preview.mode === "card"
    ? `Charged in full to ${cardLabel || "your card"} as soon as the auction ends.`
    : `A ${money(preview.cardBase)} non-refundable deposit is charged to ${cardLabel || "your card"} as soon as the auction ends. Pay the ${money(preview.balanceDue, true)} balance by bank transfer within 2 business days.`;

  function needsSetup() {
    if (!userId) { router.push(`/join?next=/lot/${lot.id}`); return true; }
    if (missing.length) { setGate(true); return true; }
    if (!props.termsCurrent) { setTermsOpen(true); return true; }
    return false;
  }

  function review(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (needsSetup()) return;
    if (props.isSeller) { setMsg({ kind: "bad", text: "This is your vehicle, so you can't bid on it." }); return; }
    if (typed < minNext) { setMsg({ kind: "bad", text: `Enter ${money(minNext)} or more.` }); return; }
    setSure(false);
    setConfirm(true);
  }

  async function placeBid() {
    setBusy(true);
    const res = await fetch("/api/bid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: lot.id, max: typed }) });
    const data = await res.json();
    setBusy(false);
    setConfirm(false);
    if (res.status === 409) { setTermsOpen(true); return; }
    if (!res.ok) { setMsg({ kind: "bad", text: data.error }); void sync(); return; }
    setMyMax(typed);
    apply({ current_bid: data.current_bid, ends_at: data.ends_at, bid_count: live.bid_count + 1 });
    setLeaderIsMe(data.status === "leading");
    setMsg(data.status === "leading"
      ? { kind: "ok", text: `You're the highest bidder at ${money(data.current_bid)}. We'll bid for you up to ${money(typed)}.${data.extended ? " The auction has been extended by 10 minutes." : ""}` }
      : { kind: "bad", text: `Another bidder's maximum is higher. The current bid is now ${money(data.current_bid)}. Try a higher maximum.` });
    void sync();
  }

  async function acceptTerms() {
    setBusy(true);
    const res = await fetch("/api/terms/accept", { method: "POST" });
    setBusy(false);
    if (res.ok) { setTermsOpen(false); router.refresh(); setMsg({ kind: "ok", text: "Thanks. You can bid now." }); }
  }

  async function buyNow() {
    setBusy(true);
    const res = await fetch("/api/buy-now", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: lot.id }) });
    const data = await res.json();
    setBusy(false);
    setBuyOpen(false);
    if (res.status === 409) { setTermsOpen(true); return; }
    if (!res.ok) { setMsg({ kind: "bad", text: data.error }); return; }
    router.push(`/account/invoices/${data.invoiceId}`);
  }

  const reserveTag = !lot.has_reserve
    ? <span className="tag" style={{ background: "var(--panel)" }}>No reserve</span>
    : live.reserve_met ? <span className="tag" style={{ background: "var(--mint)" }}>Reserve met · will sell</span>
    : <span className="tag" style={{ background: "var(--sun)" }}>Reserve not met</span>;

  let body: React.ReactNode;
  if (!ended) {
    const bn = live.buy_now_price && live.current_bid < live.buy_now_price ? live.buy_now_price : null;
    const bnPrev = bn ? priceBreakdown(bn, fees) : null;
    body = (
      <>
        {bn && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "16px 18px", borderRadius: 18, background: "var(--lime)" }}>
            <span style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: 13, fontWeight: 700 }}>Buy it now</span><b style={{ fontSize: 26, letterSpacing: "-0.03em" }}>{money(bn)}</b></span>
            <button className="btn btn-dark" style={{ height: 48, fontSize: 15 }} onClick={() => { if (!needsSetup()) setBuyOpen(true); }}>Buy now</button>
          </div>
        )}
        <form onSubmit={review} style={{ display: "flex", flexDirection: "column", gap: 14 }} noValidate>
          <label className="field"><span>Your maximum bid</span>
            <span className="moneyin"><span className="muted">$</span><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby="bidhelp" /></span>
            <span className="hint" id="bidhelp">Minimum {money(minNext)}. We bid for you, one increment at a time, up to your max. Bids in the last 10 minutes add 10 minutes.</span>
          </label>
          {msg && <div className={`notice ${msg.kind}`} role="status">{msg.text}</div>}
          <button className="btn btn-blue" style={{ height: 60, fontSize: 18 }} disabled={busy}>{leading ? "Raise my max" : "Review bid"}</button>
        </form>
        <div className="allin">
          <b style={{ fontSize: 16 }}>If you win at {money(preview.price)}, you pay</b>
          <div><span className="muted">Winning bid</span><span>{money(preview.price)}</span></div>
          <div><span className="muted">Buyer&apos;s premium ({Math.round(fees.premium_rate * 1000) / 10}%)</span><span>{money(preview.premium, true)}</span></div>
          <div><span className="muted">GST on premium</span><span>{money(preview.gst, true)}</span></div>
          <div><span className="muted">Admin fee</span><span>{money(preview.adminFee, true)}</span></div>
          {preview.surcharge > 0 && <div><span className="muted">Card surcharge</span><span>{money(preview.surcharge, true)}</span></div>}
          <div className="tot"><span>All-in</span><span>{money(preview.total, true)}</span></div>
          <div className="hint">No card surcharge. {lot.gst_status === "inc" ? "The vehicle price includes GST (GST-registered seller)." : "Private sale: no GST on the vehicle price."}</div>
          <div style={{ fontSize: 14, lineHeight: 1.45, padding: "12px 14px", borderRadius: 14, background: "var(--panel)" }}>{payNote}</div>
        </div>
        {confirm && (
          <Modal title={`Confirm your maximum: ${money(typed)}`} onClose={() => setConfirm(false)}>
            <p className="muted" style={{ fontSize: 16 }}>{lot.title}. We&apos;ll bid for you, one increment at a time, only as far as needed to keep you in front, up to {money(typed)}. <b>Bids can&apos;t be withdrawn.</b></p>
            <div className="allin" style={{ border: 0, padding: 0 }}>
              <div><span className="muted">If you win at your full maximum</span><span>{money(preview.price)}</span></div>
              <div><span className="muted">Premium, GST and admin fee</span><span>{money(preview.subtotal - preview.price, true)}</span></div>
              <div className="tot"><span>All-in, at most</span><span>{money(preview.total, true)}</span></div>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>{payNote}</p>
            {bigJump && (
              <label className="notice bad" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} style={{ width: 20, height: 20, flexShrink: 0 }} />
                <span>That&apos;s {typed >= minNext * 2 ? `${Math.floor(typed / Math.max(1, minNext))}×` : "well above"} the next bid of {money(minNext)}. Tick to confirm {money(typed)} is right.</span>
              </label>
            )}
            <label style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 14, lineHeight: 1.5, padding: "14px 16px", borderRadius: 16, background: "var(--panel)" }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ width: 20, height: 20, margin: "1px 0 0", flexShrink: 0, accentColor: "#2F5BFF" }} />
              <span>I understand this vehicle is sold <b>as is, where is</b>, at the seller&apos;s location, the condition report is a guide only, and if I win I authorise payment from my card straight away under the <Link className="blue" href="/terms" style={{ fontWeight: 700 }} target="_blank">terms of sale</Link>.</span>
            </label>
            <button className="btn btn-blue" onClick={placeBid} disabled={busy || !ack || (bigJump && !sure)}>{busy ? "Placing bid…" : `Place bid of up to ${money(typed)}`}</button>
            <button className="btn btn-soft" onClick={() => setConfirm(false)}>Change amount</button>
          </Modal>
        )}
        {buyOpen && bn && bnPrev && (
          <Modal title={`Buy it now for ${money(bn)}?`} onClose={() => setBuyOpen(false)}>
            <p className="muted">{lot.title}. The auction ends immediately and the vehicle is yours, as is, where is, with no warranty.</p>
            <div className="allin" style={{ border: 0, padding: 0 }}>
              <div><span className="muted">Buy Now price</span><span>{money(bn)}</span></div>
              <div><span className="muted">Premium, GST and admin fee</span><span>{money(bnPrev.subtotal - bn, true)}</span></div>
              <div className="tot"><span>All-in</span><span>{money(bnPrev.total, true)}</span></div>
            </div>
            <p style={{ fontSize: 14 }}>{bnPrev.mode === "card" ? `${money(bnPrev.cardAmount, true)} is charged to ${cardLabel} now.` : `A ${money(bnPrev.cardAmount, true)} non-refundable deposit is charged to ${cardLabel} now. Pay the balance by bank transfer within 2 business days.`}</p>
            <label style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 14 }}>
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ width: 20, height: 20, flexShrink: 0 }} />
              <span>I&apos;ve read the listing and accept the <Link className="blue" href="/terms" target="_blank">terms of sale</Link>.</span>
            </label>
            <button className="btn btn-blue" onClick={buyNow} disabled={busy || !ack}>{busy ? "Buying…" : "Confirm purchase"}</button>
            <button className="btn btn-soft" onClick={() => setBuyOpen(false)}>Cancel</button>
          </Modal>
        )}
      </>
    );
  } else if (live.status === "sold") {
    const mine = !!userId && (live.winner_id === userId || !!props.invoiceId);
    body = (
      <div className="soft" style={{ background: mine ? "var(--mint)" : "var(--panel)" }}>
        <b>{mine ? "You bought this vehicle." : `Sold for ${money(live.sold_price)}.`}</b>
        {mine && props.invoiceId && <Link className="btn btn-dark" href={`/account/invoices/${props.invoiceId}`} style={{ height: 48, fontSize: 15, alignSelf: "flex-start" }}>View invoice and collection</Link>}
      </div>
    );
  } else if (live.status === "referred") {
    body = (
      <div className="soft" style={{ background: "var(--sun)" }}>
        <b>{leading ? "Your bid is with the seller." : "Referred to the seller."}</b>
        <span>{leading
          ? `Bidding ended below the reserve. Your bid of ${money(live.current_bid)} has gone to the seller, who has until ${dateLong(live.decision_by)} to accept or decline. Your bid stays binding until then.`
          : `Bidding ended below the reserve and the highest bid is with the seller. If they decline, offers will open here.`}</span>
      </div>
    );
  } else if (live.status === "offers") {
    body = <OfferForm lotId={lot.id} current={live.current_bid} decisionBy={live.decision_by} lastOffer={props.lastOffer} onNeedSetup={needsSetup} />;
  } else if (live.status === "live") {
    body = <div className="soft" style={{ background: "var(--panel)" }}><b>Bidding has closed.</b><span className="muted">Working out the result…</span></div>;
  } else {
    body = <div className="soft" style={{ background: "var(--panel)" }}><b>This auction has ended.</b><span className="muted">Save a search to hear about similar vehicles.</span></div>;
  }

  return (
    <>
      <div className="bidbox">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {reserveTag}
          {!ended && myMax != null && (leading
            ? <span className="tag" style={{ background: "var(--mint)" }}>Winning · your max {money(myMax)}</span>
            : <span className="tag" style={{ background: "var(--berry)" }}>Outbid · your max {money(myMax)}</span>)}
        </div>
        <div className="big2">
          <div><div className="k">{live.status === "sold" ? "Sold for" : "Current bid"}</div><div className="v">{money(live.status === "sold" ? live.sold_price : live.current_bid)}</div><div className="hint">{live.bid_count} bids{rt ? " · live" : ""}</div></div>
          <div><div className="k">{ended ? "Status" : "Ends in"}</div>{ended ? <div className="v" style={{ fontSize: 28 }}>Closed</div> : <Countdown className="v" style={{ color: "var(--urgent)" }} endsAt={endsAtAdjusted} />}<div className="hint">{dateTime(live.ends_at)}</div></div>
        </div>
        {body}
        <WatchButton lotId={lot.id} initial={props.watched} title={lot.title} variant="button" />
        {gate && (
          <Modal title="Finish verifying to bid." onClose={() => setGate(false)}>
            <p className="muted" style={{ fontSize: 17 }}>Every buyer verifies their mobile, adds a card and verifies their ID once. It keeps every auction genuine.</p>
            <ul style={{ margin: 0, paddingLeft: 20, fontWeight: 600 }}>{missing.map((n) => <li key={n}>{STEP_NAMES[n]}</li>)}</ul>
            <Link className="btn btn-blue" href={`/join?step=${missing[0]}&next=/lot/${lot.id}`}>Continue</Link>
            <button className="btn btn-soft" onClick={() => setGate(false)}>Not now</button>
          </Modal>
        )}
        {termsOpen && (
          <Modal title="We've updated our terms." onClose={() => setTermsOpen(false)}>
            <p className="muted" style={{ fontSize: 16 }}>Before you bid again, please read and accept the current <Link className="blue" href="/terms" target="_blank">Terms of Sale</Link> and <Link className="blue" href="/privacy" target="_blank">Privacy Policy</Link>. The main changes cover collection, claims and the removal of card surcharges.</p>
            <button className="btn btn-blue" onClick={acceptTerms} disabled={busy}>{busy ? "Saving…" : "I accept the terms"}</button>
            <button className="btn btn-soft" onClick={() => setTermsOpen(false)}>Not now</button>
          </Modal>
        )}
      </div>
      <div className="soft">
        <b style={{ fontSize: 17, marginBottom: 8 }}>Bid history</b>
        <div className="hist">
          {history.length === 0 && <span className="muted">No bids yet. Be the first.</span>}
          {history.map((h, i) => (
            <div key={`${h.created_at}-${i}`}><span><BlurName mask={h.bidder_mask || h.bidder_tag} />{h.is_auto ? <span className="muted" style={{ fontSize: 13 }}> · auto</span> : null}</span><b>{money(h.amount)}</b><span className="muted" style={{ textAlign: "right" }}>{new Date(h.created_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span></div>
          ))}
        </div>
        <span className="hint">Bidder names are hidden for privacy. Times are in your time zone.</span>
      </div>
    </>
  );
}

// A bidder's name, blurred. The text is a made-up placeholder from the server, never the real name.
export function BlurName({ mask }: { mask: string }) {
  return <><span className="blurname" aria-hidden="true">{mask}</span><span className="sr-only">Bidder (name hidden)</span></>;
}

function OfferForm({ lotId, current, decisionBy, lastOffer, onNeedSetup }: { lotId: number; current: number; decisionBy: string | null; lastOffer: { amount: number; status: string } | null; onNeedSetup: () => boolean }) {
  const router = useRouter();
  const [amount, setAmount] = useState(String((lastOffer?.amount || current) + bidIncrement(lastOffer?.amount || current)));
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (onNeedSetup()) return;
    const n = Number(amount.replace(/[^0-9]/g, ""));
    if (!confirm(`Offer ${money(n)}? If the seller accepts, it's binding and payment is taken the same way as a win.`)) return;
    setBusy(true);
    const res = await fetch("/api/offer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, amount: n }) });
    const data = await res.json();
    setBusy(false);
    setMsg(res.ok ? { kind: "ok", text: "Offer sent to the seller. If they accept, payment is taken the same way as a win." } : { kind: "bad", text: data.error });
    if (res.ok) router.refresh();
  }
  return (
    <div className="soft" style={{ background: "var(--panel)" }}>
      <b>Reserve not met. Make an offer.</b>
      <span className="muted">The auction closed below the seller&apos;s reserve. Offer an amount before {dateLong(decisionBy)}. Offers are binding if accepted, and you can raise yours while the offer period is open.</span>
      {lastOffer && <span style={{ fontWeight: 600 }}>Your last offer: {money(lastOffer.amount)} ({lastOffer.status === "pending" ? "with the seller" : lastOffer.status})</span>}
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }} noValidate>
        <span className="moneyin" style={{ background: "#FFFFFF" }}><span className="muted">$</span><input inputMode="numeric" aria-label="Offer amount" value={amount} onChange={(e) => setAmount(e.target.value)} /></span>
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
        <button className="btn btn-blue" disabled={busy}>{busy ? "Sending…" : "Make offer"}</button>
      </form>
    </div>
  );
}
