import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { depositFor, lotFees, priceBreakdown } from "@/lib/fees";
import { countdown, dateTime, money } from "@/lib/format";
import { rightsLine } from "@/lib/listing";
import { ackPayLine, winPayLine } from "@/lib/deposits";
import { ACK_CHECK } from "@/lib/transport";
import { TENDER_STEPS } from "@/lib/live";
import { api, ApiError, errText } from "~/lib/api";
import { SITE } from "~/lib/env";
import { useSession } from "~/lib/session";
import type { AppLot, Fees, MyLotState } from "~/lib/types";
import { Button, Check, LineItem, MoneyField, Notice, Sheet, Soft, T, Tag, digits, useNow } from "./kit";
import { useLive } from "./useLive";
import { DepositHint, DepositShortBox, shortFrom } from "./Deposit";
import { C, F } from "./theme";

type Msg = { kind: "ok" | "bad"; text: string } | null;

/** A tender in the app (the website's TenderPanel): one sealed amount, changed or taken back until it closes. */
export function TenderPanel({ lot, fees: allFees, mine, onMineChange, onStatusChange }: {
  lot: AppLot; fees: Fees; mine: MyLotState | null; onMineChange: () => void; onStatusChange: () => void;
}) {
  const fees = useMemo(() => lotFees(allFees, lot), [allFees, lot]);
  const { me, signedIn, refresh } = useSession();
  const missing = signedIn ? me?.missing || [] : [1, 2, 3, 4, 5];
  const { live, endsMs } = useLive(lot.id, lot);
  const L = live || lot;
  const now = useNow(L.status === "live");
  const start = Math.max(1, Number(lot.start_price) || 0);
  const [myTender, setMyTender] = useState<number | null>(mine?.my_max ?? null);
  const [amount, setAmount] = useState(String(mine?.my_max || start));
  const [sheet, setSheet] = useState<null | "confirm" | "terms">(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [short, setShort] = useState<{ need: number; have: number; amount: number } | null>(null);
  const typed = digits(amount);
  const preview = priceBreakdown(Math.max(typed, start), fees);
  const closed = L.status !== "live" || endsMs <= now;
  const lastStatus = useRef(L.status);
  useEffect(() => { if (L.status !== lastStatus.current) { lastStatus.current = L.status; onStatusChange(); } }, [L.status, onStatusChange]);

  function review() {
    setMsg(null); setShort(null);
    if (!signedIn) { router.push(`/join?next=${encodeURIComponent(`/lot/${lot.id}`)}`); return; }
    if (missing.length) { router.push(`/join?step=${missing[0]}`); return; }
    if (me?.profile?.terms_current === false) { setSheet("terms"); return; }
    if (mine?.is_seller) { setMsg({ kind: "bad", text: "This is your vehicle, so you can't put in a tender." }); return; }
    if (typed < start) { setMsg({ kind: "bad", text: `Tenders start at ${money(start)}.` }); return; }
    setAck(false); setSheet("confirm");
  }
  async function send() {
    setBusy(true);
    try {
      await api("/api/bid", { body: { lotId: lot.id, max: typed } });
      setSheet(null); setMyTender(typed);
      setMsg({ kind: "ok", text: `Your tender of ${money(typed)} is in. Nobody else can see it. You can change it or take it back until ${dateTime(L.ends_at)}.` });
      onMineChange();
    } catch (e) {
      setSheet(e instanceof ApiError && e.status === 409 ? "terms" : null);
      const sh = shortFrom(e, typed);
      if (sh) setShort(sh); else if (!(e instanceof ApiError && e.status === 409)) setMsg({ kind: "bad", text: errText(e) });
    }
    setBusy(false);
  }
  async function withdraw() {
    setBusy(true);
    try { await api("/api/tender", { method: "DELETE", body: { lotId: lot.id } }); setMyTender(null); setMsg({ kind: "ok", text: "Your tender has been taken back." }); onMineChange(); }
    catch (e) { setMsg({ kind: "bad", text: errText(e) }); }
    setBusy(false);
  }
  async function acceptTerms() {
    setBusy(true);
    try { await api("/api/terms/accept", { method: "POST" }); await refresh(); setSheet(null); setMsg({ kind: "ok", text: "Thanks. You can put in a tender now." }); }
    catch (e) { setMsg({ kind: "bad", text: errText(e) }); }
    setBusy(false);
  }

  return (
    <View style={s.box} testID="tender-panel">
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "space-between" }}>
        <Tag label="Tender" color={C.lilac} />
        {myTender != null && !closed ? <Tag label={`Your tender ${money(myTender)}`} color={C.mint} /> : null}
      </View>
      <View style={{ flexDirection: "row", gap: 16 }}>
        <View style={{ flex: 1 }}><Text style={s.k}>Tenders in</Text><Text style={s.v} testID="tender-count">{L.tender_count ?? lot.tender_count ?? 0}</Text><T v="small">Amounts stay sealed</T></View>
        <View style={{ flex: 1 }}><Text style={s.k}>{closed ? "Status" : "Closes in"}</Text><Text style={[s.v, { color: closed ? C.ink : C.urgent, fontSize: closed ? 26 : 28 }]}>{closed ? "Closed" : countdown(endsMs - now)}</Text><T v="small">{dateTime(L.ends_at)}</T></View>
      </View>
      {closed ? <Soft><T v="strong">The tender has closed.</T><T v="muted">Working out the result…</T></Soft> : (
        <View style={{ gap: 12 }}>
          {TENDER_STEPS.map((t, i) => <T key={i} v="body" style={{ fontSize: 15, lineHeight: 21 }}>{`${i + 1}. ${t}`}</T>)}
          <MoneyField testID="tender-amount" label={myTender != null ? "Change your tender" : "Your tender"} value={amount} onChange={setAmount} hint={`From ${money(start)}. It closes on time: late tenders don't extend it.`} />
          {short ? <DepositShortBox need={short.need} have={short.have} amount={short.amount} lotId={lot.id} />
            : signedIn && !missing.length ? <DepositHint fees={fees} deposit={me?.profile?.deposit} amount={typed} holdingHere={myTender ? depositFor(myTender, fees) : 0} lotId={lot.id} /> : null}
          {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
          <Button testID="review-tender" title={myTender != null ? "Review new tender" : "Review tender"} onPress={review} busy={busy} />
          {myTender != null ? <Button kind="soft" small title="Take my tender back" onPress={withdraw} busy={busy} testID="tender-withdraw" /> : null}
        </View>
      )}
      <View style={s.allin}>
        <T v="strong">If your tender of {money(preview.price)} wins, you pay</T>
        <LineItem k="Your tender" v={money(preview.price)} />
        <LineItem k="Premium, GST and admin fee" v={money(preview.subtotal - preview.price, true)} />
        <LineItem k="All-in" v={money(preview.total, true)} bold />
      </View>

      <Sheet visible={sheet === "confirm"} onClose={() => setSheet(null)} title={`Put in a tender of ${money(typed)}?`} scroll testID="confirm-tender"
        footer={<>
          <Button testID="send-tender" title={`Put in my tender of ${money(typed)}`} busy={busy} disabled={!ack} onPress={send} />
          <Button kind="soft" title="Change amount" onPress={() => setSheet(null)} />
        </>}>
        <T v="muted">{lot.title}. If yours is the highest tender when it closes and it meets the reserve, you buy it at {money(typed)}. It's binding once the tender closes; until then you can change it or take it back.</T>
        <View>
          <LineItem k="Your tender" v={money(typed)} />
          <LineItem k="Premium, GST and admin fee" v={money(preview.subtotal - preview.price, true)} />
          <LineItem k="All-in if it wins" v={money(preview.total, true)} bold />
        </View>
        <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>{winPayLine(preview) || ""}</T>
        <Soft style={{ padding: 14 }}>
          <Check testID="tender-ack" checked={ack} onChange={setAck}>{`I understand this vehicle is sold as is, where is: ${ACK_CHECK}. And ${ackPayLine(preview.payMode)}, under the terms of sale.`}</Check>
          <Text style={s.link} onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms#t-tender`)}>How tenders work ›</Text>
        </Soft>
        <T v="small">{rightsLine("outright", lot.seller_type)}.</T>
      </Sheet>
      <Sheet visible={sheet === "terms"} onClose={() => setSheet(null)} title="We've updated our terms."
        footer={<><Button title="I accept the terms" busy={busy} onPress={acceptTerms} /><Button kind="soft" title="Not now" onPress={() => setSheet(null)} /></>}>
        <T v="muted">Before you bid or put in a tender, please read and accept the current Terms of Sale and Privacy Policy.</T>
        <Text style={s.link} onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms`)}>Read the terms ›</Text>
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderRadius: 28, borderWidth: 1, borderColor: C.line, padding: 18, gap: 16, backgroundColor: "#FFFFFF" },
  k: { fontFamily: F.bold, fontSize: 13, color: C.muted },
  v: { fontFamily: F.heavy, fontSize: 30, letterSpacing: -0.8, color: C.ink, fontVariant: ["tabular-nums"] },
  allin: { gap: 2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, paddingTop: 14 },
  link: { fontFamily: F.bold, fontSize: 15, color: C.blue, marginTop: 6 },
});
