import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { depositSteps, depositWhat } from "@/lib/deposits";
import { dateLong, money } from "@/lib/format";
import type { MyDeposit, PayBank } from "@/lib/types";
import { api, errText } from "~/lib/api";
import { SITE } from "~/lib/env";
import { useSession } from "~/lib/session";
import { Button, Empty, Loading, MoneyField, Notice, Screen, T, digits } from "~/ui/kit";
import { DepositPay } from "~/ui/Deposit";
import { C, F } from "~/ui/theme";

type Data = { deposit: MyDeposit; payId: boolean; bank: PayBank };

/** The bidder's deposit (the website's /account/deposit): what they can bid, what's holding it, topping up and getting it back. */
export default function DepositScreen() {
  const params = useLocalSearchParams<{ bid?: string; lot?: string }>();
  const { config, me, refresh } = useSession();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    try { setD(await api<Data>("/api/deposit")); setErr(""); } catch (e) { setErr(errText(e)); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const fees = config?.fees;
  if (err && !d) return <Screen><Empty title="Can't load your deposit." sub={err}><Button title="Try again" onPress={load} /></Empty></Screen>;
  if (!d || !fees) return <Loading />;
  const dep = d.deposit;
  const target = Number(params.bid) || null;
  const lotId = Number(params.lot) || null;
  const back = lotId ? () => (router.canGoBack() ? router.back() : router.replace(`/lot/${lotId}`)) : undefined;
  const freeShare = dep.balance > 0 ? Math.max(0, Math.min(1, dep.available / dep.balance)) : 0;
  const pending = dep.history.filter((e) => e.kind === "withdrawal" && e.status === "pending");
  const name = me?.profile?.first_name || "";

  async function withdraw() {
    const n = digits(amount);
    if (!(n > 0)) { setMsg({ ok: false, text: "Enter how much to withdraw." }); return; }
    setBusy(true); setMsg(null);
    try {
      await api("/api/deposit/withdraw", { body: { amount: n } });
      setAmount("");
      setMsg({ ok: true, text: `Done. We'll send ${money(n)} back to the account it came from, usually the same or next business day.` });
      await Promise.all([load(), refresh()]);
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
    setBusy(false);
  }
  async function cancel(id: string) {
    try { await api("/api/deposit/withdraw/cancel", { body: { id } }); await load(); } catch (e) { setMsg({ ok: false, text: errText(e) }); }
  }

  return (
    <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} testID="deposit-home">
      <T v="d2">Bidding deposit.</T>
      <T v="muted" style={{ fontSize: 17, lineHeight: 24 }}>Refundable, and paid by PayID or bank transfer. It’s how we keep bidding honest without ever taking your card.</T>

      <View style={[s.paddle, dep.balance <= 0 && { backgroundColor: C.panel }]} testID="paddle">
        <View style={s.hole} />
        <Text style={s.pLbl}>{name ? `${name}, you can bid` : "You can bid"}</Text>
        {dep.unlimited
          ? <Text style={[s.pBig, { fontFamily: F.serif, letterSpacing: -1 }]} testID="paddle-limit">any amount</Text>
          : <Text style={s.pBig} adjustsFontSizeToFit numberOfLines={1} testID="paddle-limit">{money(dep.limit || 0)}</Text>}
        <Text style={s.pSub}>{dep.unlimited ? `${money(dep.available)} free covers the ${money(dep.cap)} deposit for any one vehicle.`
          : (dep.limit || 0) > 0 ? `${money(dep.available)} free × ${Math.round(1 / (dep.rate || 0.1))}. Top up any time to bid more.`
          : dep.balance > 0 ? "Your deposit is holding the vehicles you're winning." : `Add a deposit (from ${money(dep.min)}) to start bidding.`}</Text>
        <View style={s.pNo}>
          <Text style={s.pNoT}>Bidder <Text style={{ fontFamily: F.heavy, color: C.ink, letterSpacing: 0.6 }}>{dep.ref}</Text></Text>
          <Text accessibilityRole="button" accessibilityLabel="Copy your reference" style={s.copy} onPress={() => Clipboard.setStringAsync(dep.ref).then(() => setMsg({ ok: true, text: "Reference copied." }))}>Copy</Text>
        </View>
      </View>

      {dep.balance > 0 ? (
        <View style={s.facts}>
          <View style={s.meter} accessibilityLabel={`${money(dep.available)} free of ${money(dep.balance)}`}>
            <View style={{ flex: freeShare, backgroundColor: C.ink }} /><View style={{ flex: 1 - freeShare, backgroundColor: C.sun }} />
          </View>
          <Fact sw={C.ink} k="Free to bid with" v={money(dep.available)} testID="dep-free" />
          <Fact sw={C.sun} k="Holding vehicles you’re winning" v={money(dep.committed)} />
          {dep.pending_withdrawal > 0 ? <Fact k="On its way back to you" v={money(dep.pending_withdrawal)} /> : null}
          <Fact k="Your deposit" v={money(dep.balance)} bold testID="dep-balance" />
        </View>
      ) : null}

      {dep.holding.length ? (
        <View style={s.sec}>
          <T v="d3">What it’s holding.</T>
          <T v="muted">While you’re winning, we keep the deposit for your maximum. If you’re outbid it’s free again straight away.</T>
          {dep.holding.map((h) => (
            <Pressable key={`${h.lot_id}-${h.why}`} accessibilityRole="button" onPress={() => router.push(`/lot/${h.lot_id}`)} style={s.line}>
              <View style={{ flex: 1 }}><T v="strong" numberOfLines={1}>{h.title}</T><T v="small">{h.why}</T></View>
              <T v="strong">{money(h.amount)}</T>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={s.sec}>
        <T v="d3">{dep.balance > 0 ? "Raise your limit." : "Add your deposit."}</T>
        <DepositPay fees={fees} summary={dep} bank={d.bank} payIdOn={d.payId} testMode={!!config?.testMode} target={target}
          onArrived={() => { void load(); void refresh(); }} backLabel={lotId ? "Back to the vehicle" : undefined} onBack={back} />
      </View>

      <View style={s.sec}>
        <T v="d3">How it works.</T>
        {depositSteps(fees).map(([t, x], i) => (
          <View key={t} style={s.step}>
            <View style={s.stepN}><Text style={s.stepNT}>{i + 1}</Text></View>
            <View style={{ flex: 1, gap: 2 }}><T v="strong">{t}</T><T v="body" style={{ fontSize: 14, lineHeight: 20, color: C.ink2 }}>{x}</T></View>
          </View>
        ))}
        <T v="small">If you win and don’t pay, you lose the deposit that went towards that vehicle (half goes to the seller). <Text style={{ fontFamily: F.bold, color: C.blue }} onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms#t-payment`)}>Terms of sale, sections 8 and 11 ›</Text></T>
      </View>

      {dep.balance > 0 || dep.history.length ? (
        <View style={s.sec}>
          <T v="d3">Get it back.</T>
          {dep.unpaid ? <Notice>Pay for the vehicle you won first, then you can withdraw what’s left.</Notice>
            : dep.available > 0 ? (
              <>
                <MoneyField testID="withdraw-amount" label={`Amount (up to ${money(dep.available)})`} value={amount} onChange={setAmount} />
                <T v="body" style={{ fontSize: 15 }}>Goes back to <Text style={{ fontFamily: F.bold }}>{dep.refund_to?.name || "the account your deposit came from"}{dep.refund_to?.bsb ? ` · BSB ${dep.refund_to.bsb.replace(/^(\d{3})(\d{3})$/, "$1-$2")}` : ""}{dep.refund_to?.ending ? ` · account ending ${dep.refund_to.ending}` : ""}</Text></T>
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <Button small kind="dark" title="Withdraw" busy={busy} onPress={withdraw} testID="withdraw-go" />
                  <Text accessibilityRole="button" style={{ fontFamily: F.bold, color: C.blue }} onPress={() => setAmount(String(Math.floor(dep.available)))}>All of it ({money(dep.available)})</Text>
                </View>
              </>
            ) : <T v="muted">{dep.balance > 0 ? "All of your deposit is holding vehicles you're winning. It's free to withdraw once you're not." : "Nothing to withdraw."}</T>}
          {pending.map((w) => (
            <View key={w.id} style={s.pend} testID="withdraw-pending">
              <T v="body" style={{ flex: 1, fontSize: 15 }}>{money(-w.amount, true)} refund requested {dateLong(w.created_at)}. We send it within a business day.</T>
              <Text accessibilityRole="button" style={{ fontFamily: F.bold, color: C.ink }} onPress={() => cancel(w.id)}>Cancel</Text>
            </View>
          ))}
        </View>
      ) : null}
      {msg ? <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice> : null}

      {dep.history.length ? (
        <View style={s.sec} testID="deposit-history">
          <T v="d3">Every movement.</T>
          {dep.history.map((e) => (
            <View key={e.id} style={[s.line, e.status === "cancelled" && { opacity: 0.5 }]}>
              <View style={{ flex: 1 }}>
                <T v="strong">{depositWhat(e)}</T>
                <T v="small">{dateLong(e.created_at)}{e.invoice_id ? " · " : ""}{e.invoice_id ? <Text style={{ fontFamily: F.bold, color: C.blue }} onPress={() => router.push(`/invoice/${e.invoice_id}`)}>Invoice</Text> : null}</T>
              </View>
              <Text style={[s.amt, e.amount > 0 && { color: "#0B7A47" }]}>{e.amount > 0 ? "+" : "−"}{money(Math.abs(e.amount), !Number.isInteger(e.amount))}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function Fact({ k, v, sw, bold, testID }: { k: string; v: string; sw?: string; bold?: boolean; testID?: string }) {
  return (
    <View style={[s.fact, bold && { borderBottomWidth: 0 }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
        {sw ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: sw }} /> : null}
        <Text style={[s.factK, bold && { fontFamily: F.bold, color: C.ink }]}>{k}</Text>
      </View>
      <Text style={s.factV} testID={testID}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  paddle: { borderRadius: 32, padding: 24, paddingTop: 22, gap: 6, backgroundColor: C.lime, minHeight: 220, overflow: "hidden" },
  hole: { position: "absolute", top: 20, right: 22, width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  pLbl: { fontFamily: F.bold, fontSize: 16, color: C.ink, paddingRight: 56 },
  pBig: { fontFamily: F.heavy, fontSize: 56, color: C.ink, letterSpacing: -2.4, lineHeight: 62, fontVariant: ["tabular-nums"] },
  pSub: { fontFamily: F.semibold, fontSize: 15, lineHeight: 21, color: C.ink2 },
  pNo: { marginTop: "auto", paddingTop: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  pNoT: { fontFamily: F.semibold, fontSize: 14, color: C.ink2 },
  copy: { fontFamily: F.bold, fontSize: 13, color: C.ink, backgroundColor: "#FFFFFF", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, overflow: "hidden" },
  facts: { borderRadius: 28, backgroundColor: C.panel, padding: 18, gap: 0 },
  meter: { height: 12, borderRadius: 6, overflow: "hidden", flexDirection: "row", backgroundColor: C.panel2, marginBottom: 8 },
  fact: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  factK: { fontFamily: F.medium, fontSize: 15, color: C.ink2, flexShrink: 1 },
  factV: { fontFamily: F.heavy, fontSize: 18, color: C.ink, letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
  sec: { gap: 12, marginTop: 10 },
  line: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  amt: { fontFamily: F.heavy, fontSize: 16, color: C.ink, fontVariant: ["tabular-nums"] },
  step: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 20, backgroundColor: C.panel },
  stepN: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" },
  stepNT: { fontFamily: F.heavy, fontSize: 13, color: C.lime },
  pend: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, backgroundColor: C.sun },
});
