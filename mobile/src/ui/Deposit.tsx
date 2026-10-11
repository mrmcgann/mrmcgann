import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { depositFor, payMode } from "@/lib/fees";
import { depositShortBy, limitChoices } from "@/lib/deposits";
import { money } from "@/lib/format";
import type { DepositSummary, Fees, PayBank } from "@/lib/types";
import { api, errText } from "~/lib/api";
import { Button, MoneyField, Notice, T, digits } from "./kit";
import { C, F } from "./theme";

// The bidding deposit in the app: how to pay us (PayID or bank transfer), choosing a limit, and the hints
// beside a bid. The same rules and words as the website (src/components/deposit).

function CopyRow({ k, v, copy, hl, testID }: { k: string; v: string; copy?: string; hl?: boolean; testID?: string }) {
  const [done, setDone] = useState(false);
  return (
    <View style={[s.row, hl && s.rowHl]}>
      <Text style={s.k}>{k}</Text>
      <Text style={s.v} selectable testID={testID}>{v}</Text>
      {copy ? (
        <Text accessibilityRole="button" accessibilityLabel={`Copy ${k.toLowerCase()}`} style={[s.copy, done && { backgroundColor: C.mint }]}
          onPress={() => Clipboard.setStringAsync(copy).then(() => { setDone(true); setTimeout(() => setDone(false), 1800); })}>{done ? "Copied" : "Copy"}</Text>
      ) : null}
    </View>
  );
}

/** Exactly how to pay: the amount, the reference that matches it to you, and our account. Optional single-use PayID. */
export function PayRows({ amount, reference, bank, payIdOn, requestUrl, requestLabel, note }: {
  amount: number; reference: string; bank: PayBank; payIdOn?: boolean; requestUrl?: string; requestLabel?: string; note?: string;
}) {
  const [one, setOne] = useState<{ payId: string; amount: number; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function getPayId() {
    if (!requestUrl) return;
    setBusy(true); setErr("");
    try { setOne(await api<{ payId: string; amount: number; expiresAt: string }>(requestUrl, { body: { amount } })); }
    catch (e) { setErr(errText(e)); }
    setBusy(false);
  }
  return (
    <View style={s.paybox} testID="paybox">
      {payIdOn && requestUrl && !one ? (
        <View style={{ gap: 10 }}>
          <T v="body" style={{ fontSize: 15 }}><Text style={{ fontFamily: F.bold }}>Quickest: a PayID just for this payment.</Text> It shows our name before you pay, and we see it the moment it lands.</T>
          <Button small kind="dark" title={requestLabel || `Get a PayID for ${money(amount)}`} busy={busy} onPress={getPayId} />
          {err ? <T v="small" style={{ color: C.badInk }}>{err}</T> : null}
          <Text style={s.or}>Or pay by bank transfer</Text>
        </View>
      ) : null}
      {one ? (
        <>
          <CopyRow k="PayID" v={one.payId} copy={one.payId} hl testID="pay-payid" />
          <CopyRow k="Amount" v={money(one.amount, !Number.isInteger(one.amount))} copy={String(one.amount)} />
          <T v="small">Pay it from your banking app to this PayID. It’s for this payment only and expires {new Date(one.expiresAt).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}.</T>
        </>
      ) : (
        <>
          <CopyRow k="Amount" v={money(amount, !Number.isInteger(amount))} copy={String(amount)} testID="pay-amount" />
          <CopyRow k="Reference" v={reference} copy={reference} hl testID="pay-ref" />
          <CopyRow k="Account name" v={bank.name} copy={bank.name} />
          <CopyRow k="BSB" v={bank.bsb} copy={bank.bsb.replace(/\D/g, "")} />
          <CopyRow k="Account" v={bank.account} copy={bank.account.replace(/\D/g, "")} />
          {bank.payId ? <CopyRow k="Or PayID" v={bank.payId} copy={bank.payId} /> : null}
        </>
      )}
      <View style={s.warn}><T v="body" style={{ fontSize: 14, lineHeight: 20 }}><Text style={{ fontFamily: F.bold }}>Always check before you pay. </Text>We never change these details by email, text or phone, and we never ask you to pay a seller. Unsure? Call us first.</T></View>
      {note ? <T v="small">{note}</T> : null}
    </View>
  );
}

/** "How much do you want to be able to bid?" → the deposit, what to pay now and how. Then it watches for the money. */
export function DepositPay({ fees, summary, bank, payIdOn, testMode, target, onArrived, backLabel, onBack }: {
  fees: Fees; summary: DepositSummary; bank: PayBank; payIdOn: boolean; testMode: boolean; target?: number | null;
  onArrived?: (s: DepositSummary) => void; backLabel?: string; onBack?: () => void;
}) {
  const choices = useMemo(() => limitChoices(fees), [fees]);
  const cap = fees.deposit_cap ?? 0;
  const first = choices.find((c) => c.deposit > summary.available) || choices[choices.length - 1];
  const [pick, setPick] = useState<string>(target ? "custom" : String(first?.limit ?? "none"));
  const [custom, setCustom] = useState(target ? String(target) : "");
  const [waiting, setWaiting] = useState(false);
  const [arrived, setArrived] = useState<DepositSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const startBalance = useRef(summary.balance);

  const wanted = pick === "custom" ? digits(custom) : pick === "none" ? null : Number(pick);
  const need = wanted === null ? cap : depositFor(wanted, fees);
  const topUp = Math.max(0, Math.ceil(need - summary.available));
  const ready = wanted === null || wanted > 0;

  // Watch for it (every 8 seconds, for 15 minutes after they say they've sent it).
  useEffect(() => {
    if (!waiting) return;
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      if (n > 110) { clearInterval(t); return; }
      const r = await api<{ deposit: DepositSummary }>("/api/deposit").catch(() => null);
      if (r && r.deposit.balance > startBalance.current) { clearInterval(t); setWaiting(false); setArrived(r.deposit); onArrived?.(r.deposit); }
    }, 8000);
    return () => clearInterval(t);
  }, [waiting, onArrived]);

  async function pretend() {
    setBusy(true); setErr("");
    try {
      await api("/api/deposit/test", { body: { amount: topUp || need } });
      const r = await api<{ deposit: DepositSummary }>("/api/deposit");
      setArrived(r.deposit); onArrived?.(r.deposit);
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }

  if (arrived) {
    return (
      <View style={s.done} testID="deposit-arrived" accessibilityLiveRegion="polite">
        <Text style={s.doneT}>Your deposit has arrived.</Text>
        <T v="body">{arrived.unlimited ? "You can bid any amount." : `You can now bid up to ${money(arrived.limit || 0)}.`}</T>
        {onBack ? <Button small kind="dark" title={backLabel || "Continue"} onPress={onBack} /> : null}
      </View>
    );
  }
  return (
    <View style={{ gap: 16 }} testID="deposit-pay">
      <T v="strong" style={{ fontSize: 17 }}>How much do you want to be able to bid?</T>
      <View style={s.chips}>
        {choices.map((c) => {
          const k = String(c.limit ?? "none");
          const on = pick === k;
          return (
            <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => setPick(k)} style={[s.chip, on && s.chipOn]} testID={`limit-${k}`}>
              <Text style={[s.chipT, on && { color: "#FFFFFF" }]}>{c.label}</Text>
              <Text style={[s.chipS, on && { color: C.lime }]}>{money(c.deposit)} deposit</Text>
            </Pressable>
          );
        })}
      </View>
      <MoneyField testID="limit-custom" label="Or another amount" value={custom} onChange={(v) => { setPick("custom"); setCustom(v); }} hint="The most you want to bid on one vehicle." />

      {ready ? (
        <View style={s.sum} testID="deposit-sum">
          <View style={s.sumCell}><Text style={s.sumK}>{wanted === null ? "Deposit for no limit" : `Deposit to bid ${money(wanted)}`}</Text><Text style={s.sumV}>{money(need)}</Text></View>
          <View style={s.sumCell}><Text style={s.sumK}>Free now</Text><Text style={s.sumV}>{money(summary.available)}</Text></View>
          <View style={[s.sumCell, { backgroundColor: C.sun }]}><Text style={[s.sumK, { color: C.ink }]}>{topUp > 0 ? "Pay now" : "Nothing to pay"}</Text><Text style={[s.sumV, { fontSize: 24 }]} testID="deposit-topup">{money(topUp)}</Text></View>
        </View>
      ) : null}

      {ready && topUp > 0 ? (
        <>
          <PayRows amount={topUp} reference={summary.ref} bank={bank} payIdOn={payIdOn} requestUrl="/api/deposit/payid" requestLabel={`Get a PayID for ${money(topUp)}`}
            note="Pay from an account in your own name (or a joint account you hold). We can’t accept money from anyone else, and your deposit only ever goes back to the account it came from." />
          {waiting ? (
            <View style={s.wait} testID="deposit-waiting" accessibilityLiveRegion="polite">
              <View style={s.dot} />
              <T v="body" style={{ flex: 1, fontSize: 15 }}><Text style={{ fontFamily: F.bold }}>Watching for your deposit. </Text>PayID usually lands in a minute; a bank transfer can take up to a business day. We’ll text you when it arrives, so you can close this.</T>
            </View>
          ) : <Button testID="deposit-sent" title={`I’ve sent ${money(topUp)}`} onPress={() => setWaiting(true)} />}
          {testMode ? <Pressable accessibilityRole="button" onPress={pretend} disabled={busy} style={s.test} testID="deposit-test"><Text style={s.testT}>{busy ? "Recording…" : `Test mode: pretend ${money(topUp)} arrived`}</Text></Pressable> : null}
          {err ? <Notice kind="bad">{err}</Notice> : null}
        </>
      ) : null}
      {ready && topUp === 0 ? <Notice kind="ok">Your deposit already covers this.</Notice> : null}
    </View>
  );
}

const go = (amount: number, lotId: number) => router.push(`/deposit?bid=${amount}&lot=${lotId}`);

/** Under the bid box: your limit here, or exactly how much to add for the amount typed. */
export function DepositHint({ fees, deposit, amount, holdingHere, lotId }: { fees: Fees; deposit: DepositSummary | null | undefined; amount: number; holdingHere: number; lotId: number }) {
  if (payMode(fees) !== "deposit" || !deposit || deposit.balance <= 0) return null;
  const { need, free, short } = depositShortBy(amount, fees, deposit, holdingHere);
  if (amount > 0 && short > 0) {
    return (
      <View style={s.need} testID="deposit-need">
        <T v="body" style={{ fontSize: 14, lineHeight: 20 }}>To bid {money(amount)} you need {money(need)} of bidding deposit free. You have {money(Math.max(0, free))}.</T>
        <Button small kind="dark" title={`Add ${money(short)}`} onPress={() => go(amount, lotId)} />
      </View>
    );
  }
  const any = deposit.unlimited || (deposit.cap > 0 && free >= deposit.cap);
  return (
    <T v="small" testID="deposit-limit">
      {any ? "Your deposit covers any amount. " : `Your bid limit here: ${money(Math.floor(free / (deposit.rate || 0.1)))}. `}
      <Text style={{ fontFamily: F.bold, color: C.blue }} onPress={() => go(amount, lotId)}>Raise it ›</Text>
    </T>
  );
}

/** The engine said the deposit doesn't cover it (402 from bid, Buy Now or an offer). */
export function DepositShortBox({ need, have, amount, lotId }: { need: number; have: number; amount: number; lotId: number }) {
  const add = Math.max(0, Math.ceil(need - have));
  return (
    <View style={[s.need, { backgroundColor: C.badBg }]} testID="deposit-short" accessibilityRole="alert">
      <T v="body" style={{ fontSize: 14, lineHeight: 20 }}><Text style={{ fontFamily: F.bold }}>Top up to bid {money(amount)}. </Text>It needs {money(need)} of bidding deposit free{have > 0 ? ` and you have ${money(have)} free` : ""}.</T>
      <Button small kind="dark" title={`Add ${money(add)}`} onPress={() => go(amount, lotId)} />
    </View>
  );
}

/** A 402 from the API, as numbers (or null for any other error). */
export function shortFrom(e: unknown, amount: number): { need: number; have: number; amount: number } | null {
  const x = e as { status?: number; data?: Record<string, unknown> };
  if (x?.status !== 402 || x.data?.code !== "deposit_short") return null;
  return { need: Number(x.data.need) || 0, have: Number(x.data.have) || 0, amount };
}

const s = StyleSheet.create({
  paybox: { gap: 2, padding: 16, borderRadius: 24, borderWidth: 1, borderColor: C.line, backgroundColor: "#FFFFFF" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  rowHl: { backgroundColor: C.lime, borderRadius: 14, paddingHorizontal: 10, borderBottomWidth: 0, marginVertical: 2 },
  k: { width: 104, fontFamily: F.semibold, fontSize: 14, color: C.muted },
  v: { flex: 1, fontFamily: F.heavy, fontSize: 17, color: C.ink, letterSpacing: 0.2, fontVariant: ["tabular-nums"] },
  copy: { fontFamily: F.bold, fontSize: 13, color: C.ink, backgroundColor: C.panel, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, overflow: "hidden" },
  or: { fontFamily: F.bold, fontSize: 13, color: C.muted, marginTop: 4 },
  warn: { marginTop: 10, padding: 12, borderRadius: 16, backgroundColor: C.panel },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexBasis: "47%", flexGrow: 1, padding: 14, borderRadius: 18, backgroundColor: C.panel, gap: 2 },
  chipOn: { backgroundColor: C.ink },
  chipT: { fontFamily: F.heavy, fontSize: 16, color: C.ink, letterSpacing: -0.2 },
  chipS: { fontFamily: F.semibold, fontSize: 13, color: C.muted },
  sum: { flexDirection: "row", gap: 8 },
  sumCell: { flex: 1, padding: 12, borderRadius: 16, backgroundColor: C.panel, gap: 2 },
  sumK: { fontFamily: F.semibold, fontSize: 12, color: C.muted },
  sumV: { fontFamily: F.heavy, fontSize: 19, color: C.ink, letterSpacing: -0.4, fontVariant: ["tabular-nums"] },
  wait: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 18, backgroundColor: C.panel },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.blue, marginTop: 5 },
  test: { alignSelf: "flex-start", borderWidth: 2, borderStyle: "dashed", borderColor: "#C7C7CC", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  testT: { fontFamily: F.bold, fontSize: 14, color: C.ink2 },
  done: { gap: 8, padding: 20, borderRadius: 24, backgroundColor: C.mint },
  doneT: { fontFamily: F.heavy, fontSize: 22, color: C.ink, letterSpacing: -0.4 },
  need: { gap: 10, padding: 14, borderRadius: 18, backgroundColor: C.sun },
});
