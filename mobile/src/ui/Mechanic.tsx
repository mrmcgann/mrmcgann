import { useCallback, useEffect, useState } from "react";
import { Alert, Platform, Text, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { dayLabel, slotLabel, whenLabel, type Slot } from "@/lib/viewings";
import {
  INSPECTION_STATUS, MECHANIC_CHECKS, MECHANIC_LIMITS, MECHANIC_MAX_SLOTS, MECHANIC_PARTS, cancelTerms, feeText, inspectionDays, isOpen,
  mechanicOption, type Inspection,
} from "@/lib/inspections";
import type { PayBank } from "@/lib/types";
import { api, errText } from "~/lib/api";
import { SITE } from "~/lib/env";
import { useSession } from "~/lib/session";
import { Button, Check, Field, LinkText, Notice, Pill, Sheet, Soft, T } from "./kit";
import { PayRows } from "./Deposit";
import { Badge } from "./Viewing";
import { F } from "./theme";

type Row = Inspection & { has_report?: boolean };
type Data = { on: boolean; fee: number; ack: string; inspections: Row[]; bank?: PayBank };

/** "Send our mobile mechanic": the second way to inspect a truck before the auction. Same rules and words as the website
 *  (src/lib/inspections.ts and src/components/Mechanic.tsx); the database enforces them (request_inspection) and keeps
 *  what the member agreed to. Anything the mechanic finds goes on the listing for every bidder. */
export function MechanicBox({ lotId, title, state, auctionAt, open }: { lotId: number; title: string; state: string; auctionAt: string | null; open: boolean }) {
  const { signedIn } = useSession();
  const [d, setD] = useState<Data | null>(null);
  const [form, setForm] = useState(false);
  const [more, setMore] = useState(false);
  const load = useCallback(async () => {
    try { setD(await api<Data>(`/api/inspections?lot=${lotId}`)); } catch { /* shown as nothing booked */ }
  }, [lotId]);
  useEffect(() => { void load(); }, [load, signedIn]);
  if (!d || !d.on) return null;
  const mine = d.inspections || [];
  const current = mine.find(isOpen) || mine.find((m) => m.status === "done");
  const opt = mechanicOption(d.fee);
  const cancel = (i: Row) => {
    const t = cancelTerms(i);
    if (!t.can) { Alert.alert("Call us", t.why || "That booking can't be cancelled online."); return; }
    const go = async () => { try { await api(`/api/inspections/${i.id}`, { method: "DELETE" }); } catch (e) { Alert.alert("Couldn't cancel it", errText(e)); } void load(); };
    if (Platform.OS === "web") { if (confirm(`Cancel inspection ${i.ref}? ${t.why}`)) void go(); return; }
    Alert.alert(`Cancel inspection ${i.ref}?`, `${t.why} We'll let the owner know.`, [{ text: "Keep it", style: "cancel" }, { text: "Cancel it", style: "destructive", onPress: () => void go() }]);
  };
  const openReport = async (i: Row) => {
    try { const r = await api<{ url: string }>(`/api/inspections/${i.id}/report?json=1`); await WebBrowser.openBrowserAsync(r.url); } catch (e) { Alert.alert("The report isn't available", errText(e)); }
  };
  return (
    <Soft style={{ gap: 8 }} testID="mechanic">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <T v="strong" style={{ fontSize: 17, flexShrink: 1 }}>{opt.title}.</T><Badge text={opt.price} tone="sun" />
      </View>
      {opt.lines.map((l) => <T key={l} v="muted">• {l}</T>)}
      <LinkText title={more ? "Less" : "What the mechanic checks"} onPress={() => setMore(!more)} style={{ fontSize: 14 }} />
      {more ? <View style={{ gap: 4 }} testID="mechanic-checks">{MECHANIC_CHECKS.map((c) => <T key={c} v="small">• {c}.</T>)}<T v="small">{MECHANIC_LIMITS} Anything they find goes on the listing for every bidder, and the owner is told.</T></View> : null}
      {current ? (
        <View style={{ gap: 6 }} testID="mechanic-booked">
          {current.status === "requested" ? <T v="body" style={{ fontSize: 15, lineHeight: 21 }}><Text style={{ fontFamily: F.bold }}>Asked for </Text>{current.slots.map(slotLabel).join("; ")}. We'll agree a time with the owner and our mechanic, then send you the amount to pay.</T> : null}
          {current.status === "booked" ? (
            <>
              <T v="body" style={{ fontSize: 15, lineHeight: 21 }}><Text style={{ fontFamily: F.bold }}>Booked: {current.starts_at ? whenLabel(current.starts_at, state) : ""}</Text>{current.mechanic ? `, with ${current.mechanic}` : ""}. You don't need to be there.</T>
              <T v="body" style={{ fontSize: 15, lineHeight: 21 }}>Pay <Text style={{ fontFamily: F.bold }}>${feeText(Number(current.fee))}</Text> (including GST) by {current.pay_by ? whenLabel(current.pay_by, state) : "the time we gave you"}, or the booking lapses.</T>
              {d.bank ? <PayRows amount={Number(current.fee)} reference={current.ref} bank={d.bank} note={`Use the reference ${current.ref} so we can match it to your booking.`} /> : null}
            </>
          ) : null}
          {current.status === "paid" ? (
            <T v="body" style={{ fontSize: 15, lineHeight: 21 }}><Text style={{ fontFamily: F.bold }}>Booked and paid: {current.starts_at ? whenLabel(current.starts_at, state) : ""}</Text>{current.mechanic ? `, with ${current.mechanic}` : ""}. The report comes to you, usually by the end of the next business day.</T>
          ) : null}
          {current.status === "done" ? (
            <>
              <T v="strong">Report ready.</T>
              {current.summary ? <T v="muted" testID="mechanic-summary">{current.summary}</T> : null}
              <Button small kind="dark" title="Read the full report" onPress={() => void openReport(current)} style={{ alignSelf: "flex-start" }} />
              <T v="small">Anything the mechanic found is on this listing's damage and wear, for every bidder.</T>
            </>
          ) : null}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <T v="small">Reference {current.ref}</T>
            {current.paid_at ? <LinkText title="Tax invoice" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/api/inspections/${current.id}/invoice`)} style={{ fontSize: 13 }} /> : null}
            {isOpen(current) ? <LinkText title="Cancel" onPress={() => cancel(current)} style={{ fontSize: 13 }} /> : null}
          </View>
        </View>
      ) : open ? <Button testID="mechanic-ask" small kind="dark" title="Book our mechanic" onPress={() => setForm(true)} style={{ alignSelf: "flex-start", marginTop: 4 }} />
        : <T v="small">Inspections close the day before the auction.</T>}
      {mine.filter((m) => m !== current && !isOpen(m)).slice(0, 3).map((m) => (
        <T key={m.id} v="small">Inspection {m.ref}: {INSPECTION_STATUS[m.status] || m.status}{m.staff_note && ["cancelled", "declined"].includes(m.status) ? `. ${m.staff_note}` : ""}
          {Number(m.refund_due) > 0 ? (m.refunded_at ? ` Refunded $${feeText(Number(m.refund_due))}.` : ` Refund of $${feeText(Number(m.refund_due))} on its way.`) : ""}</T>
      ))}
      {form ? <BookSheet lotId={lotId} title={title} auctionAt={auctionAt} ack={d.ack} fee={d.fee} onClose={() => setForm(false)} onDone={() => { setForm(false); void load(); }} /> : null}
    </Soft>
  );
}

function BookSheet({ lotId, title, auctionAt, ack, fee, onClose, onDone }: { lotId: number; title: string; auctionAt: string | null; ack: string; fee: number; onClose: () => void; onDone: () => void }) {
  const { me, signedIn } = useSession();
  const [picked, setPicked] = useState<Slot[]>([]);
  const [note, setNote] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ref, setRef] = useState<string | null>(null);
  const days = inspectionDays(auctionAt);
  const path = `/lot/${lotId}`;
  const missing = me?.missing || [];
  const need = !signedIn ? "signin" : missing.some((n) => n !== 4) ? "verify" : null;
  const on = (s: Slot) => picked.some((p) => p.day === s.day && p.part === s.part);
  const toggle = (s: Slot) => {
    setErr("");
    if (on(s)) setPicked(picked.filter((p) => !(p.day === s.day && p.part === s.part)));
    else if (picked.length >= MECHANIC_MAX_SLOTS) setErr(`Pick up to ${MECHANIC_MAX_SLOTS}. Untick one to choose another.`);
    else setPicked([...picked, s]);
  };
  const go = (to: string) => { onClose(); router.push(to as never); };
  async function submit() {
    if (!picked.length) return setErr("Pick at least one day that suits you.");
    if (!agree) return setErr("Tick the box to agree to how the inspection works first.");
    setBusy(true); setErr("");
    try { const r = await api<{ ref: string }>("/api/inspections", { body: { lotId, slots: picked, note, agree } }); setRef(r.ref); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }
  if (need) {
    return (
      <Sheet visible onClose={onClose} title="Book our mechanic." testID="mechanic-sheet"
        footer={need === "signin"
          ? <><Button title="Sign in" onPress={() => go(`/signin?next=${encodeURIComponent(path)}`)} /><Button kind="soft" title="Join free" onPress={() => go(`/join?next=${encodeURIComponent(path)}`)} /></>
          : <Button title="Finish setting up" onPress={() => go(`/join?step=${missing[0]}&next=${encodeURIComponent(path)}`)} />}>
        <T v="body" style={{ fontSize: 17, lineHeight: 25 }}>{need === "signin" ? "Sign in or join first. Booking our mechanic is for verified members."
          : "Booking our mechanic is for verified members. Finish setting up your account (your details, mobile and ID): it's the same check as bidding."}</T>
      </Sheet>
    );
  }
  if (ref) {
    return (
      <Sheet visible onClose={onDone} title="Thanks, we've got it." testID="mechanic-sheet" footer={<Button title="Done" onPress={onDone} />}>
        <T v="body" style={{ fontSize: 17, lineHeight: 25 }}>We'll agree a time with the owner of the {title} and our mechanic, usually within one business day, then send you the amount to pay (${feeText(fee)} including GST). Your reference is <Text style={{ fontFamily: F.heavy }}>{ref}</Text>.</T>
        <T v="small">You don't need to be there. The report comes to you, and anything the mechanic finds goes on the listing for every bidder.</T>
      </Sheet>
    );
  }
  return (
    <Sheet visible onClose={onClose} title="Book our mechanic." scroll testID="mechanic-sheet"
      footer={<Button testID="mechanic-submit" title={`Book our mechanic, $${feeText(fee)}`} busy={busy} disabled={!days.length} onPress={submit} />}>
      <T v="muted">Pick up to three mornings or afternoons that suit you, up to the day before the auction. We agree one with the owner and our mechanic, then send you the amount to pay.</T>
      {days.length === 0 ? <Notice kind="bad"><T v="body">The auction is too close to fit an inspection in. Call us and we'll see what we can do.</T></Notice> : days.map((day) => (
        <View key={day} style={{ gap: 6 }}>
          <T v="strong">{dayLabel(day)}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{MECHANIC_PARTS.map(([p, label]) => <Pill key={p} label={label} on={on({ day, part: p })} onPress={() => toggle({ day, part: p })} testID={`mslot-${day}-${p}`} />)}</View>
        </View>
      ))}
      <T v="small">{MECHANIC_PARTS.map(([, l, h]) => `${l} ${h}`).join("; ")}, in the truck's local time.</T>
      <Field label="Anything you want the mechanic to look at? (optional)" value={note} onChangeText={setNote} maxLength={500} multiline />
      <Check checked={agree} onChange={(v) => { setAgree(v); setErr(""); }} testID="mechanic-ack"><T v="body" style={{ fontSize: 14, lineHeight: 20 }}>{ack}</T></Check>
      <LinkText title="Terms, section 5 ›" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms#t-mechanic`)} style={{ fontSize: 14 }} />
      {err ? <Notice kind="bad"><T v="body">{err}</T></Notice> : null}
    </Sheet>
  );
}
