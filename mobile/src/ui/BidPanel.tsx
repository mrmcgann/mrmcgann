import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { priceBreakdown } from "@/lib/fees";
import { bidIncrement, countdown, dateLong, dateTime, money } from "@/lib/format";
import { api, ApiError, errText, pub } from "~/lib/api";
import { SITE } from "~/lib/env";
import { askForPush } from "~/lib/push";
import { STEP_NAMES, useSession } from "~/lib/session";
import type { AppLot, BidRow, Fees, MyLotState } from "~/lib/types";
import { Button, Check, LineItem, MoneyField, Notice, Sheet, Soft, T, Tag, digits, useNow } from "./kit";
import { useLive } from "./useLive";
import { AutoTag, BlurName } from "./BlurName";
import { C, F } from "./theme";

type Msg = { kind: "ok" | "bad"; text: string } | null;

/** Live price, bidding, Buy Now and offers for one vehicle (the website's BidPanel). */
export function BidPanel({ lot, fees, mine, history: initialHistory, onStatusChange, onMineChange }: {
  lot: AppLot; fees: Fees; mine: MyLotState | null; history: BidRow[]; onStatusChange: () => void; onMineChange: () => void;
}) {
  const { me, signedIn, refresh } = useSession();
  const userId = me?.user?.id || null;
  const missing = signedIn ? me?.missing || [] : [1, 2, 3, 4, 5];
  const termsCurrent = me?.profile?.terms_current !== false;
  const cardLabel = me?.profile?.card_brand ? `${me.profile.card_brand} ending ${me.profile.card_last4}` : "your card";
  const { live, apply, sync, rt, endsMs } = useLive(lot.id, lot);
  const L = live || lot;
  const now = useNow(L.status === "live");
  const [myMax, setMyMax] = useState<number | null>(mine?.my_max ?? null);
  const [leading, setLeading] = useState(!!userId && L.leader_id === userId);
  useEffect(() => { setMyMax(mine?.my_max ?? null); }, [mine?.my_max]);
  useEffect(() => { if (userId) setLeading(L.leader_id === userId); }, [L.leader_id, userId]);
  const minNext = L.bid_count === 0 ? Math.max(Number(lot.start_price), Number(L.current_bid)) : Number(L.current_bid) + bidIncrement(Number(L.current_bid));
  const [amount, setAmount] = useState(String(minNext));
  useEffect(() => { setAmount((a) => (digits(a) < minNext ? String(minNext) : a)); }, [minNext]);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<null | "confirm" | "gate" | "terms" | "buy">(null);
  const [ack, setAck] = useState(false);
  const [sure, setSure] = useState(false);
  const [history, setHistory] = useState(initialHistory);

  // Bid history refresh when the count changes; full reload when the auction changes state.
  const lastCount = useRef(L.bid_count);
  useEffect(() => {
    if (L.bid_count === lastCount.current) return;
    lastCount.current = L.bid_count;
    const t = setTimeout(() => { pub<BidRow[]>(`/api/lots/${lot.id}/history`).then(setHistory).catch(() => undefined); }, 600);
    return () => clearTimeout(t);
  }, [L.bid_count, lot.id]);
  const lastStatus = useRef(L.status);
  useEffect(() => { if (L.status !== lastStatus.current) { lastStatus.current = L.status; onStatusChange(); } }, [L.status, onStatusChange]);

  const ended = L.status !== "live" || (L.ends_at ? endsMs <= now : false);
  const typed = digits(amount);
  const preview = useMemo(() => priceBreakdown(typed || minNext, fees), [typed, minNext, fees]);
  const bigJump = typed >= 50_000 || (typed > minNext * 2 && typed - minNext >= 2_000);
  const payNote = preview.mode === "card"
    ? `Charged in full to ${cardLabel} as soon as the auction ends.`
    : `A ${money(preview.cardBase)} non-refundable deposit is charged to ${cardLabel} as soon as the auction ends. Pay the ${money(preview.balanceDue, true)} balance by bank transfer within 2 business days.`;
  const bn = L.buy_now_price && Number(L.current_bid) < Number(L.buy_now_price) ? Number(L.buy_now_price) : null;
  const bnPrev = bn ? priceBreakdown(bn, fees) : null;

  function needsSetup() {
    if (!signedIn) { router.push(`/join?next=${encodeURIComponent(`/lot/${lot.id}`)}`); return true; }
    if (missing.length) { setSheet("gate"); return true; }
    if (!termsCurrent) { setSheet("terms"); return true; }
    return false;
  }
  function review() {
    setMsg(null);
    if (needsSetup()) return;
    if (mine?.is_seller) { setMsg({ kind: "bad", text: "This is your vehicle, so you can't bid on it." }); return; }
    if (typed < minNext) { setMsg({ kind: "bad", text: `Enter ${money(minNext)} or more.` }); return; }
    setSure(false); setAck(false); setSheet("confirm");
  }
  async function placeBid() {
    setBusy(true);
    try {
      const d = await api<{ status: string; current_bid: number; ends_at: string; extended: boolean }>("/api/bid", { body: { lotId: lot.id, max: typed } });
      setSheet(null);
      setMyMax(typed);
      apply({ current_bid: d.current_bid, ends_at: d.ends_at, bid_count: L.bid_count + 1 });
      setLeading(d.status === "leading");
      if (Platform.OS !== "web") Haptics.notificationAsync(d.status === "leading" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      setMsg(d.status === "leading"
        ? { kind: "ok", text: `You're the highest bidder at ${money(d.current_bid)}. We'll bid for you up to ${money(typed)}.${d.extended ? " The auction has been extended by 10 minutes." : ""}` }
        : { kind: "bad", text: `Another bidder's maximum is higher. The current bid is now ${money(d.current_bid)}. Try a higher maximum.` });
      onMineChange();
      void askForPush(); // outbid alerts matter most once you've bid
    } catch (e) {
      setSheet(e instanceof ApiError && e.status === 409 ? "terms" : null);
      if (!(e instanceof ApiError && e.status === 409)) setMsg({ kind: "bad", text: errText(e) });
    }
    setBusy(false);
    void sync();
  }
  async function acceptTerms() {
    setBusy(true);
    try { await api("/api/terms/accept", { method: "POST" }); await refresh(); setSheet(null); setMsg({ kind: "ok", text: "Thanks. You can bid now." }); }
    catch (e) { setMsg({ kind: "bad", text: errText(e) }); }
    setBusy(false);
  }
  async function buyNow() {
    setBusy(true);
    try {
      const d = await api<{ invoiceId: string }>("/api/buy-now", { body: { lotId: lot.id } });
      setSheet(null);
      router.push(`/invoice/${d.invoiceId}`);
    } catch (e) {
      setSheet(e instanceof ApiError && e.status === 409 ? "terms" : null);
      setMsg({ kind: "bad", text: errText(e) });
    }
    setBusy(false);
  }

  const reserveTag = !lot.has_reserve ? <Tag label="No reserve" /> : L.reserve_met ? <Tag label="Reserve met · will sell" color={C.mint} /> : <Tag label="Reserve not met" color={C.sun} />;
  const left = endsMs - now;

  let body: React.ReactNode;
  if (!ended) {
    body = (
      <View style={{ gap: 14 }}>
        {bn ? (
          <View style={s.bn}>
            <View><Text style={s.bnK}>Buy it now</Text><Text style={s.bnV}>{money(bn)}</Text></View>
            <Button small kind="dark" title="Buy now" onPress={() => { if (!needsSetup()) { setAck(false); setSheet("buy"); } }} />
          </View>
        ) : null}
        <MoneyField testID="bid-amount" label="Your maximum bid" value={amount} onChange={setAmount} hint={`Minimum ${money(minNext)}. We bid for you, one increment at a time, up to your max. Bids in the last 10 minutes add 10 minutes.`} />
        {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
        <Button testID="review-bid" title={leading ? "Raise my max" : "Review bid"} onPress={review} busy={busy} />
        <View style={s.allin}>
          <T v="strong">If you win at {money(preview.price)}, you pay</T>
          <LineItem k="Winning bid" v={money(preview.price)} />
          <LineItem k={`Buyer's premium (${Math.round(fees.premium_rate * 1000) / 10}%)`} v={money(preview.premium, true)} />
          <LineItem k="GST on premium" v={money(preview.gst, true)} />
          <LineItem k="Admin fee" v={money(preview.adminFee, true)} />
          {preview.surcharge > 0 ? <LineItem k="Card surcharge" v={money(preview.surcharge, true)} /> : null}
          <View style={s.rule} />
          <LineItem k="All-in" v={money(preview.total, true)} bold />
          <T v="small">No card surcharge. {lot.gst_status === "inc" ? "The vehicle price includes GST (GST-registered seller)." : "Private sale: no GST on the vehicle price."}</T>
          <Soft style={{ padding: 12 }}><T v="body" style={{ fontSize: 14, lineHeight: 20 }}>{payNote}</T></Soft>
        </View>
      </View>
    );
  } else if (L.status === "sold") {
    const won = !!userId && (L.winner_id === userId || !!mine?.invoice_id);
    body = (
      <Soft bg={won ? C.mint : C.panel}>
        <T v="strong">{won ? "You bought this vehicle." : `Sold for ${money(L.sold_price)}.`}</T>
        {won && mine?.invoice_id ? <Button small kind="dark" title="View invoice and collection" onPress={() => router.push(`/invoice/${mine.invoice_id}`)} /> : null}
      </Soft>
    );
  } else if (L.status === "referred") {
    body = (
      <Soft bg={C.sun}>
        <T v="strong">{leading ? "Your bid is with the seller." : "Referred to the seller."}</T>
        <T v="body">{leading
          ? `Bidding ended below the reserve. Your bid of ${money(L.current_bid)} has gone to the seller, who has until ${dateLong(L.decision_by)} to accept or decline. Your bid stays binding until then.`
          : "Bidding ended below the reserve and the highest bid is with the seller. If they decline, offers will open here."}</T>
      </Soft>
    );
  } else if (L.status === "offers") {
    body = <OfferBox lotId={lot.id} current={Number(L.current_bid)} decisionBy={L.decision_by} lastOffer={mine?.last_offer || null} needsSetup={needsSetup} onSent={onMineChange} />;
  } else if (L.status === "live") {
    body = <Soft><T v="strong">Bidding has closed.</T><T v="muted">Working out the result…</T></Soft>;
  } else {
    body = <Soft><T v="strong">This auction has ended.</T><T v="muted">Save a search to hear about similar vehicles.</T></Soft>;
  }

  return (
    <View style={{ gap: 16 }} testID="bidbox">
      <View style={s.box}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
          {reserveTag}
          {!ended && myMax != null ? (leading ? <Tag label={`Winning · your max ${money(myMax)}`} color={C.mint} /> : <Tag label={`Outbid · your max ${money(myMax)}`} color={C.berry} />) : null}
        </View>
        <View style={{ flexDirection: "row", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.k}>{L.status === "sold" ? "Sold for" : L.bid_count ? "Current bid" : "Starting bid"}</Text>
            <Text testID="current-bid" style={s.v}>{money(L.status === "sold" ? L.sold_price : L.bid_count ? L.current_bid : minNext)}</Text>
            <T v="small">{L.bid_count} bid{L.bid_count === 1 ? "" : "s"}{rt ? " · live" : ""}</T>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.k}>{ended ? "Status" : "Ends in"}</Text>
            <Text style={[s.v, { color: ended ? C.ink : C.urgent, fontSize: ended ? 26 : 28 }]}>{ended ? "Closed" : countdown(left)}</Text>
            <T v="small">{dateTime(L.ends_at)}</T>
          </View>
        </View>
        {body}
      </View>

      <Soft>
        <T v="strong">Bid history</T>
        {history.length === 0 ? <T v="muted">No bids yet. Be the first.</T> : history.map((h, i) => (
          <View key={`${h.created_at}-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4, gap: 10 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", marginLeft: -4 }}>
              <BlurName mask={h.bidder_mask || h.bidder_tag} style={{ flexShrink: 1 }} />{h.is_auto ? <AutoTag /> : null}
            </View>
            <T v="strong">{money(h.amount)}</T>
            <T v="small" style={{ width: 82, textAlign: "right" }}>{new Date(h.created_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", second: "2-digit" })}</T>
          </View>
        ))}
        <T v="small">Bidder names are hidden for privacy. Times are in your time zone.</T>
      </Soft>

      <Sheet visible={sheet === "confirm"} onClose={() => setSheet(null)} title={`Confirm your maximum: ${money(typed)}`} scroll testID="confirm-bid"
        footer={<>
          <Button testID="place-bid" title={`Place bid of up to ${money(typed)}`} busy={busy} disabled={!ack || (bigJump && !sure)} onPress={placeBid} />
          <Button kind="soft" title="Change amount" onPress={() => setSheet(null)} />
        </>}>
        <T v="muted">{lot.title}. We'll bid for you, one increment at a time, only as far as needed to keep you in front, up to {money(typed)}. Bids can't be withdrawn.</T>
        <View>
          <LineItem k="If you win at your full maximum" v={money(preview.price)} />
          <LineItem k="Premium, GST and admin fee" v={money(preview.subtotal - preview.price, true)} />
          <LineItem k="All-in, at most" v={money(preview.total, true)} bold />
        </View>
        <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>{payNote}</T>
        {bigJump ? <Notice kind="bad"><Check checked={sure} onChange={setSure}>{`That's ${typed >= minNext * 2 ? `${Math.floor(typed / Math.max(1, minNext))}×` : "well above"} the next bid of ${money(minNext)}. Tick to confirm ${money(typed)} is right.`}</Check></Notice> : null}
        <Soft style={{ padding: 14 }}>
          <Check testID="ack" checked={ack} onChange={setAck}>I understand this vehicle is sold as is, where is, at the seller's location, the condition report is a guide only, and if I win I authorise payment from my card straight away under the terms of sale.</Check>
          <Text style={s.link} onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms`)}>Read the terms of sale ›</Text>
        </Soft>
      </Sheet>

      <Sheet visible={sheet === "buy" && !!bnPrev} onClose={() => setSheet(null)} title={`Buy it now for ${money(bn)}?`}
        footer={<><Button title="Confirm purchase" busy={busy} disabled={!ack} onPress={buyNow} /><Button kind="soft" title="Cancel" onPress={() => setSheet(null)} /></>}>
        <T v="muted">{lot.title}. The auction ends immediately and the vehicle is yours, as is, where is, with no warranty.</T>
        {bnPrev ? <View>
          <LineItem k="Buy Now price" v={money(bn)} />
          <LineItem k="Premium, GST and admin fee" v={money(bnPrev.subtotal - (bn || 0), true)} />
          <LineItem k="All-in" v={money(bnPrev.total, true)} bold />
          <T v="body" style={{ fontSize: 14, marginTop: 8 }}>{bnPrev.mode === "card" ? `${money(bnPrev.cardAmount, true)} is charged to ${cardLabel} now.` : `A ${money(bnPrev.cardAmount, true)} non-refundable deposit is charged to ${cardLabel} now. Pay the balance by bank transfer within 2 business days.`}</T>
        </View> : null}
        <Check checked={ack} onChange={setAck}>I've read the listing and accept the terms of sale.</Check>
      </Sheet>

      <Sheet visible={sheet === "gate"} onClose={() => setSheet(null)} title="Finish verifying to bid."
        footer={<><Button title="Continue" onPress={() => { setSheet(null); router.push(`/join?step=${missing[0]}&next=${encodeURIComponent(`/lot/${lot.id}`)}`); }} /><Button kind="soft" title="Not now" onPress={() => setSheet(null)} /></>}>
        <T v="muted">Every buyer verifies their mobile, adds a card and verifies their ID once. It keeps every auction genuine.</T>
        {missing.map((n) => <T key={n} v="strong">• {STEP_NAMES[n]}</T>)}
      </Sheet>

      <Sheet visible={sheet === "terms"} onClose={() => setSheet(null)} title="We've updated our terms."
        footer={<><Button title="I accept the terms" busy={busy} onPress={acceptTerms} /><Button kind="soft" title="Not now" onPress={() => setSheet(null)} /></>}>
        <T v="muted">Before you bid again, please read and accept the current Terms of Sale and Privacy Policy.</T>
        <Text style={s.link} onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms`)}>Read the Terms of Sale ›</Text>
        <Text style={s.link} onPress={() => WebBrowser.openBrowserAsync(`${SITE}/privacy`)}>Read the Privacy Policy ›</Text>
      </Sheet>
    </View>
  );
}

function OfferBox({ lotId, current, decisionBy, lastOffer, needsSetup, onSent }: { lotId: number; current: number; decisionBy: string | null; lastOffer: { amount: number; status: string } | null; needsSetup: () => boolean; onSent: () => void }) {
  const base = lastOffer?.amount || current;
  const [amount, setAmount] = useState(String(base + bidIncrement(base)));
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  async function send() {
    setBusy(true);
    try {
      await api("/api/offer", { body: { lotId, amount: digits(amount) } });
      setMsg({ kind: "ok", text: "Offer sent to the seller. If they accept, payment is taken the same way as a win." });
      onSent();
    } catch (e) { setMsg({ kind: "bad", text: errText(e) }); }
    setBusy(false); setConfirm(false);
  }
  return (
    <Soft>
      <T v="strong">Reserve not met. Make an offer.</T>
      <T v="muted">The auction closed below the seller's reserve. Offer an amount before {dateLong(decisionBy)}. Offers are binding if accepted, and you can raise yours while the offer period is open.</T>
      {lastOffer ? <T v="strong">Your last offer: {money(lastOffer.amount)} ({lastOffer.status === "pending" ? "with the seller" : lastOffer.status})</T> : null}
      <MoneyField label="Your offer" value={amount} onChange={setAmount} />
      {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
      <Button title="Make offer" busy={busy} onPress={() => { if (!needsSetup()) setConfirm(true); }} />
      <Sheet visible={confirm} onClose={() => setConfirm(false)} title={`Offer ${money(digits(amount))}?`}
        footer={<><Button title="Send offer" busy={busy} onPress={send} /><Button kind="soft" title="Cancel" onPress={() => setConfirm(false)} /></>}>
        <T v="muted">If the seller accepts, it's binding and payment is taken the same way as a win.</T>
      </Sheet>
    </Soft>
  );
}

const s = StyleSheet.create({
  box: { borderRadius: 28, borderWidth: 1, borderColor: C.line, padding: 18, gap: 16, backgroundColor: "#FFFFFF" },
  k: { fontFamily: F.bold, fontSize: 13, color: C.muted },
  v: { fontFamily: F.heavy, fontSize: 30, letterSpacing: -0.8, color: C.ink, fontVariant: ["tabular-nums"] },
  bn: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: C.lime, borderRadius: 18, padding: 14 },
  bnK: { fontFamily: F.bold, fontSize: 13, color: C.ink },
  bnV: { fontFamily: F.heavy, fontSize: 24, color: C.ink, letterSpacing: -0.6 },
  allin: { gap: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, paddingTop: 14 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginVertical: 4 },
  link: { fontFamily: F.bold, fontSize: 15, color: C.blue, marginTop: 6 },
});
