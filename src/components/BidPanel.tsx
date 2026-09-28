"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { Fees, Lot } from "@/lib/types";
import { priceBreakdown } from "@/lib/fees";
import { bidIncrement, dateLong, dateTime, money } from "@/lib/format";
import { Countdown } from "@/components/Countdown";
import { WatchButton } from "@/components/WatchButton";
import { Modal } from "@/components/Modal";

type Live = Pick<Lot, "status" | "current_bid" | "bid_count" | "ends_at" | "reserve_met" | "leader_id" | "decision_by" | "winner_id" | "sold_price">;

const STEP_NAMES: Record<number, string> = { 2: "Your details", 3: "Verify mobile", 4: "Payment card", 5: "Verify ID" };

export function BidPanel(props: {
  lot: Lot; fees: Fees; userId: string | null; missing: number[]; cardLabel: string | null;
  myMax: number | null; watched: boolean; invoiceId: string | null; lastOffer: { amount: number; status: string } | null;
}) {
  const { lot, fees, userId, missing, cardLabel } = props;
  const router = useRouter();
  const [live, setLive] = useState<Live>(lot);
  const [myMax, setMyMax] = useState(props.myMax);
  const minNext = live.bid_count === 0 ? Math.max(lot.start_price, live.current_bid) : live.current_bid + bidIncrement(live.current_bid);
  const [amount, setAmount] = useState(String(minNext));
  const [ack, setAck] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [gate, setGate] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);

  useEffect(() => {
    try { setAck(sessionStorage.getItem(`ack-${lot.id}`) === "1"); } catch {}
    const db = supabaseBrowser();
    const ch = db.channel(`lot-${lot.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lots", filter: `id=eq.${lot.id}` }, (payload: { new: Record<string, unknown> }) => {
        setLive((prev) => ({ ...prev, ...(payload.new as unknown as Live) }));
        router.refresh();
      })
      .subscribe();
    return () => { db.removeChannel(ch); };
  }, [lot.id, router]);

  const ended = live.status !== "live" || (live.ends_at ? new Date(live.ends_at).getTime() <= Date.now() : false);
  const leading = !!userId && live.leader_id === userId;
  const typed = Number(String(amount).replace(/[^0-9]/g, "")) || 0;
  const preview = useMemo(() => priceBreakdown(typed || minNext, fees), [typed, minNext, fees]);
  const payNote = preview.mode === "card"
    ? `Charged in full to ${cardLabel || "your card"} as soon as the auction ends.`
    : `A ${money(preview.cardBase)} non-refundable deposit (plus surcharge) is charged to ${cardLabel || "your card"} as soon as the auction ends. Pay the ${money(preview.balanceDue, true)} balance by bank transfer within 2 business days.`;

  function needsSetup() {
    if (!userId) { router.push(`/join?next=/lot/${lot.id}`); return true; }
    if (missing.length) { setGate(true); return true; }
    return false;
  }

  async function submitBid(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (needsSetup()) return;
    if (!ack) { setMsg({ kind: "bad", text: "Tick the box to confirm you understand the vehicle is sold as is, where is, and payment is taken if you win." }); return; }
    setBusy(true);
    const res = await fetch("/api/bid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: lot.id, max: typed }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) { setMsg({ kind: "bad", text: data.error }); return; }
    setMyMax(typed);
    setLive((p) => ({ ...p, current_bid: data.current_bid, ends_at: data.ends_at, leader_id: data.status === "leading" ? userId : p.leader_id }));
    setMsg(data.status === "leading"
      ? { kind: "ok", text: `You're the highest bidder at ${money(data.current_bid)}. We'll bid for you up to ${money(typed)}.${data.extended ? " The auction has been extended by 10 minutes." : ""}` }
      : { kind: "bad", text: `Another bidder's maximum is higher. The current bid is now ${money(data.current_bid)}. Try a higher maximum.` });
    router.refresh();
  }

  async function buyNow() {
    setBusy(true);
    const res = await fetch("/api/buy-now", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: lot.id }) });
    const data = await res.json();
    setBusy(false);
    setBuyOpen(false);
    if (!res.ok) { setMsg({ kind: "bad", text: data.error }); return; }
    router.push(`/account/invoices/${data.invoiceId}`);
  }

  const reserveTag = !lot.has_reserve
    ? <span className="tag" style={{ background: "var(--panel)" }}>No reserve</span>
    : live.reserve_met ? <span className="tag" style={{ background: "var(--mint)" }}>Reserve met · will sell</span>
    : <span className="tag" style={{ background: "var(--sun)" }}>Reserve not met</span>;

  let body: React.ReactNode;
  if (!ended) {
    const bn = lot.buy_now_price && live.current_bid < lot.buy_now_price ? lot.buy_now_price : null;
    const bnPrev = bn ? priceBreakdown(bn, fees) : null;
    body = (
      <>
        {bn && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "16px 18px", borderRadius: 18, background: "var(--lime)" }}>
            <span style={{ display: "flex", flexDirection: "column" }}><span style={{ fontSize: 13, fontWeight: 700 }}>Buy it now</span><b style={{ fontSize: 26, letterSpacing: "-0.03em" }}>{money(bn)}</b></span>
            <button className="btn btn-dark" style={{ height: 48, fontSize: 15 }} onClick={() => { if (!needsSetup()) setBuyOpen(true); }}>Buy now</button>
          </div>
        )}
        <form onSubmit={submitBid} style={{ display: "flex", flexDirection: "column", gap: 14 }} noValidate>
          <label className="field"><span>Your maximum bid</span>
            <span className="moneyin"><span className="muted">$</span><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby="bidhelp" /></span>
            <span className="hint" id="bidhelp">Minimum {money(minNext)}. We bid for you, one increment at a time, up to your max. Bids in the last 10 minutes add 10 minutes.</span>
          </label>
          {!ack && (
            <label style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 14, lineHeight: 1.5, padding: "14px 16px", borderRadius: 16, background: "var(--panel)" }}>
              <input type="checkbox" onChange={(e) => { setAck(e.target.checked); try { sessionStorage.setItem(`ack-${lot.id}`, e.target.checked ? "1" : "0"); } catch {} }} style={{ width: 20, height: 20, margin: "1px 0 0", flexShrink: 0, accentColor: "#2F5BFF" }} />
              <span>I understand this vehicle is sold <b>as is, where is</b>, with <b>no warranty</b>, and the condition report is a guide only. If I win, I authorise Tyrebiter to take payment from my card straight away, as set out in the <Link className="blue" href="/terms#t-payment" style={{ fontWeight: 700 }}>terms</Link>.</span>
            </label>
          )}
          {msg && <div className={`notice ${msg.kind}`} role="status">{msg.text}</div>}
          <button className="btn btn-blue" style={{ height: 60, fontSize: 18 }} disabled={busy}>{busy ? "Placing bid…" : leading ? "Raise my max" : "Place bid"}</button>
        </form>
        <div className="allin">
          <b style={{ fontSize: 16 }}>If you win at {money(preview.price)}, you pay</b>
          <div><span className="muted">Winning bid</span><span>{money(preview.price)}</span></div>
          <div><span className="muted">Buyer&apos;s premium ({Math.round(fees.premium_rate * 1000) / 10}%)</span><span>{money(preview.premium, true)}</span></div>
          <div><span className="muted">GST on premium</span><span>{money(preview.gst, true)}</span></div>
          <div><span className="muted">Admin fee</span><span>{money(preview.adminFee, true)}</span></div>
          <div><span className="muted">Card surcharge ({Math.round(fees.surcharge_rate * 1000) / 10}%)</span><span>{money(preview.surcharge, true)}</span></div>
          <div className="tot"><span>All-in</span><span>{money(preview.total, true)}</span></div>
          <div style={{ fontSize: 14, lineHeight: 1.45, padding: "12px 14px", borderRadius: 14, background: "var(--panel)" }}>{payNote}</div>
        </div>
        {buyOpen && bn && bnPrev && (
          <Modal title={`Buy it now for ${money(bn)}?`} onClose={() => setBuyOpen(false)}>
            <p className="muted">{lot.title}. The auction ends immediately and the vehicle is yours, as is, where is, with no warranty.</p>
            <div className="allin" style={{ border: 0, padding: 0 }}>
              <div><span className="muted">Buy Now price</span><span>{money(bn)}</span></div>
              <div><span className="muted">Premium, GST and admin fee</span><span>{money(bnPrev.subtotal - bn, true)}</span></div>
              <div><span className="muted">Card surcharge</span><span>{money(bnPrev.surcharge, true)}</span></div>
              <div className="tot"><span>All-in</span><span>{money(bnPrev.total, true)}</span></div>
            </div>
            <p style={{ fontSize: 14 }}>{bnPrev.mode === "card" ? `${money(bnPrev.cardAmount, true)} is charged to ${cardLabel} now.` : `A ${money(bnPrev.cardAmount, true)} non-refundable deposit is charged to ${cardLabel} now. Pay the balance by bank transfer within 2 business days.`}</p>
            <button className="btn btn-blue" onClick={buyNow} disabled={busy}>{busy ? "Buying…" : "Confirm purchase"}</button>
            <button className="btn btn-soft" onClick={() => setBuyOpen(false)}>Cancel</button>
          </Modal>
        )}
      </>
    );
  } else if (live.status === "sold") {
    const mine = !!userId && live.winner_id === userId;
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
  } else {
    body = <div className="soft" style={{ background: "var(--panel)" }}><b>This auction has ended.</b><span className="muted">Save a search to hear about similar vehicles.</span></div>;
  }

  return (
    <div className="bidbox">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {reserveTag}
        {!ended && myMax != null && (leading
          ? <span className="tag" style={{ background: "var(--mint)" }}>Winning · your max {money(myMax)}</span>
          : <span className="tag" style={{ background: "var(--berry)" }}>Outbid · your max {money(myMax)}</span>)}
      </div>
      <div className="big2">
        <div><div className="k">{live.status === "sold" ? "Sold for" : "Current bid"}</div><div className="v">{money(live.status === "sold" ? live.sold_price : live.current_bid)}</div><div className="hint">{live.bid_count} bids</div></div>
        <div><div className="k">{ended ? "Status" : "Ends in"}</div>{ended ? <div className="v" style={{ fontSize: 28 }}>Closed</div> : <Countdown className="v" style={{ color: "var(--urgent)" }} endsAt={live.ends_at} />}<div className="hint">{dateTime(live.ends_at)}</div></div>
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
    </div>
  );
}

function OfferForm({ lotId, current, decisionBy, lastOffer, onNeedSetup }: { lotId: number; current: number; decisionBy: string | null; lastOffer: { amount: number; status: string } | null; onNeedSetup: () => boolean }) {
  const router = useRouter();
  const [amount, setAmount] = useState(String((lastOffer?.amount || current) + bidIncrement(lastOffer?.amount || current)));
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (onNeedSetup()) return;
    setBusy(true);
    const res = await fetch("/api/offer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, amount: Number(amount.replace(/[^0-9]/g, "")) }) });
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
