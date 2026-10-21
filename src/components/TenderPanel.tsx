"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { DepositSummary, Fees, Lot } from "@/lib/types";
import { depositFor, lotFees, priceBreakdown } from "@/lib/fees";
import { dateTime, money } from "@/lib/format";
import { Countdown } from "@/components/Countdown";
import { WatchButton } from "@/components/WatchButton";
import { Modal } from "@/components/Modal";
import { DepositNeed, DepositShort } from "@/components/deposit/DepositNeed";
import { payNoteFor } from "@/components/BidConfirm";
import { ACK_CHECK, feesLine } from "@/lib/transport";
import { ackPayLine } from "@/lib/deposits";
import { rightsLine } from "@/lib/listing";
import { TENDER_STEPS } from "@/lib/live";

// A tender: each buyer puts in one sealed amount. Nobody sees anyone else's (only how many there are). When it
// closes the highest tender buys at that price, if it meets the reserve; otherwise it goes to the seller.
// The engine is place_bid (tender branch), withdraw_tender and reveal_tenders in the database.
export function TenderPanel(props: {
  lot: Lot; fees: Fees; userId: string | null; missing: number[]; cardLabel: string | null; termsCurrent: boolean; deposit?: DepositSummary | null;
  myTender: number | null; watched: boolean; isSeller: boolean; suspended?: boolean;
}) {
  const { lot, userId, missing } = props;
  const router = useRouter();
  const fees = useMemo(() => lotFees(props.fees, lot), [props.fees, lot]);
  const [count, setCount] = useState(lot.tender_count || 0);
  const [endsAt, setEndsAt] = useState(lot.ends_at);
  const [status, setStatus] = useState<string>(lot.status);
  const [mine, setMine] = useState(props.myTender);
  const start = Math.max(1, Number(lot.start_price) || 0);
  const [amount, setAmount] = useState(String(props.myTender || start));
  const [open, setOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);
  const [short, setShort] = useState<{ need: number; have: number; amount: number } | null>(null);
  const typed = Number(String(amount).replace(/[^0-9]/g, "")) || 0;
  const preview = priceBreakdown(Math.max(typed, start), fees);

  const apply = useCallback((p: { tender_count?: number; ends_at?: string | null; status?: string }) => {
    if (p.tender_count !== undefined) setCount(p.tender_count);
    if (p.ends_at !== undefined) setEndsAt(p.ends_at);
    if (p.status && p.status !== status) { setStatus(p.status); router.refresh(); }
  }, [status, router]);
  useEffect(() => {
    const db = supabaseBrowser();
    const ch = db.channel(`lot:${lot.id}`, { config: { private: false } }).on("broadcast", { event: "lot" }, ({ payload }: { payload: { tender_count?: number; ends_at?: string | null; status?: string } }) => apply(payload)).subscribe();
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try { const r = await fetch(`/api/lots/${lot.id}/live`, { cache: "no-store" }); if (r.ok) apply(await r.json()); } catch { /* keep what we have */ }
    }, 30_000);
    return () => { clearInterval(t); db.removeChannel(ch); };
  }, [lot.id, apply]);

  const closed = status !== "live" || (endsAt ? new Date(endsAt).getTime() <= Date.now() : false);

  function needsSetup() {
    if (!userId) { router.push(`/join?next=/lot/${lot.id}`); return true; }
    if (props.suspended) { setMsg({ kind: "bad", text: "Your account can't bid at the moment. Call us if you think that's a mistake." }); return true; }
    if (missing.length) { router.push(`/join?step=${missing[0]}&next=/lot/${lot.id}`); return true; }
    if (!props.termsCurrent) { setTermsOpen(true); return true; }
    if (props.isSeller) { setMsg({ kind: "bad", text: "This is your vehicle, so you can't put in a tender." }); return true; }
    return false;
  }
  function review(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setShort(null);
    if (needsSetup()) return;
    if (typed < start) { setMsg({ kind: "bad", text: `Tenders start at ${money(start)}.` }); return; }
    setAck(false); setOpen(true);
  }
  async function send() {
    setBusy(true);
    const res = await fetch("/api/bid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: lot.id, max: typed }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false); setOpen(false);
    if (res.status === 402) { setShort({ need: data.need, have: data.have, amount: typed }); return; }
    if (!res.ok) { setMsg({ kind: "bad", text: data.error || "Couldn't send your tender. Please try again." }); return; }
    setMine(typed); setCount(data.tender_count ?? count);
    setMsg({ kind: "ok", text: `Your tender of ${money(typed)} is in. Nobody else can see it. You can change it or take it back until ${dateTime(endsAt)}.` });
  }
  async function withdraw() {
    if (!confirm("Take your tender back? You can put in a new one before it closes.")) return;
    setBusy(true);
    const res = await fetch("/api/tender", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId: lot.id }) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setMsg({ kind: "bad", text: data.error || "Couldn't take it back. Please try again." }); return; }
    setMine(null); setCount(data.tender_count ?? Math.max(0, count - 1));
    setMsg({ kind: "ok", text: "Your tender has been taken back." });
  }

  async function acceptTerms() {
    setBusy(true);
    const res = await fetch("/api/terms/accept", { method: "POST" });
    setBusy(false);
    if (res.ok) { setTermsOpen(false); router.refresh(); setMsg({ kind: "ok", text: "Thanks. You can put in a tender now." }); }
  }

  return (
    <div className="bidbox tender" data-testid="tender-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span className="tag" style={{ background: "var(--lilac)" }}>Tender</span>
        {mine != null && !closed && <span className="tag" style={{ background: "var(--mint)" }} data-testid="my-tender">Your tender {money(mine)}</span>}
      </div>
      <div className="big2">
        <div><div className="k">Tenders in</div><div className="v" data-testid="tender-count">{count}</div><div className="hint">Amounts stay sealed until it closes</div></div>
        <div><div className="k">{closed ? "Status" : "Closes in"}</div>{closed ? <div className="v" style={{ fontSize: 28 }}>Closed</div> : <Countdown className="v" style={{ color: "var(--urgent)" }} endsAt={endsAt} />}<div className="hint">{dateTime(endsAt)}</div></div>
      </div>
      {closed ? (
        <div className="soft" style={{ background: "var(--panel)" }}><b>The tender has closed.</b><span className="muted">Working out the result…</span></div>
      ) : (
        <form onSubmit={review} style={{ display: "flex", flexDirection: "column", gap: 14 }} noValidate>
          <ol className="tender-steps">{TENDER_STEPS.map((t) => <li key={t}>{t}</li>)}</ol>
          <label className="field"><span>{mine != null ? "Change your tender" : "Your tender"}</span>
            <span className="moneyin"><span className="muted">$</span><input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} aria-describedby="tenderhelp" /></span>
            <span className="hint" id="tenderhelp">From {money(start)}. It isn&apos;t extended by late tenders: it closes on time.</span>
          </label>
          {!short && <DepositNeed fees={fees} deposit={props.deposit ?? null} amount={typed} holdingHere={mine ? depositFor(mine, fees) : 0} lotId={lot.id} signedIn={!!userId && !missing.length} />}
          {short && <DepositShort need={short.need} have={short.have} amount={short.amount} lotId={lot.id} />}
          {msg && <div className={`notice ${msg.kind}`} role="status">{msg.text}</div>}
          <button className="btn btn-blue" style={{ height: 60, fontSize: 18 }} disabled={busy}>{mine != null ? "Review new tender" : "Review tender"}</button>
          {mine != null && <button type="button" className="linkbtn" onClick={withdraw} disabled={busy} data-testid="tender-withdraw">Take my tender back</button>}
        </form>
      )}
      <div className="allin">
        <b style={{ fontSize: 16 }}>If your tender of {money(preview.price)} wins, you pay</b>
        <div><span className="muted">Your tender</span><span>{money(preview.price)}</span></div>
        <div><span className="muted">Buyer&apos;s premium, GST and admin fee</span><span>{money(preview.subtotal - preview.price, true)}</span></div>
        <div className="tot"><span>All-in</span><span>{money(preview.total, true)}</span></div>
      </div>
      <WatchButton lotId={lot.id} initial={props.watched} title={lot.title} variant="button" />
      {termsOpen && (
        <Modal title="We've updated our terms." onClose={() => setTermsOpen(false)}>
          <p className="muted" style={{ fontSize: 16 }}>Before you bid or put in a tender, please read and accept the current <Link className="blue" href="/terms" target="_blank">Terms of Sale</Link> and <Link className="blue" href="/privacy" target="_blank">Privacy Policy</Link>.</p>
          <button className="btn btn-blue" onClick={acceptTerms} disabled={busy}>{busy ? "Saving…" : "I accept the terms"}</button>
          <button className="btn btn-soft" onClick={() => setTermsOpen(false)}>Not now</button>
        </Modal>
      )}
      {open && (
        <Modal title={`Put in a tender of ${money(typed)}?`} onClose={() => setOpen(false)}>
          <p className="muted" style={{ fontSize: 16 }}>{lot.title}. If yours is the highest tender when it closes and it meets the reserve, you buy it at {money(typed)}. <b>It&apos;s binding once the tender closes.</b> Until then you can change it or take it back.</p>
          <div className="allin" style={{ border: 0, padding: 0 }}>
            <div><span className="muted">Your tender</span><span>{money(typed)}</span></div>
            <div><span className="muted">{feesLine(preview.transport)}</span><span>{money(preview.subtotal - preview.price, true)}</span></div>
            <div className="tot"><span>All-in if it wins</span><span>{money(preview.total, true)}</span></div>
          </div>
          <p style={{ fontSize: 14, lineHeight: 1.5 }}>{payNoteFor(preview, props.cardLabel)}</p>
          <label style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 14, lineHeight: 1.5, padding: "14px 16px", borderRadius: 16, background: "var(--panel)" }}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} style={{ width: 20, height: 20, margin: "1px 0 0", flexShrink: 0 }} />
            <span>I understand this vehicle is sold <b>as is, where is</b>: {ACK_CHECK}. And {ackPayLine(preview.payMode)}, under the <Link className="blue" href="/terms#t-tender" style={{ fontWeight: 700 }} target="_blank">terms of sale</Link>.</span>
          </label>
          <p className="hint" style={{ margin: 0 }}>{rightsLine("outright", lot.seller_type)}. <Link className="blue" href="/terms#t-asis" target="_blank">What that means ›</Link></p>
          <button className="btn btn-blue" onClick={send} disabled={busy || !ack} data-testid="tender-send">{busy ? "Sending…" : `Put in my tender of ${money(typed)}`}</button>
          <button className="btn btn-soft" onClick={() => setOpen(false)}>Change amount</button>
        </Modal>
      )}
    </div>
  );
}
