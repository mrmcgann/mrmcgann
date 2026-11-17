import { useCallback, useEffect, useState } from "react";
import { Alert, Platform, Text, View } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { MAX_SLOTS, PARTS, STATUS_LABEL, VIEWING_HOW, VIEWING_OFF, dayLabel, slotLabel, viewingDays, whenLabel, type Slot, type Viewing } from "@/lib/viewings";
import { api, errText } from "~/lib/api";
import { SITE } from "~/lib/env";
import { useSession } from "~/lib/session";
import { Button, Check, Field, LinkText, Notice, Pill, Sheet, Soft, T } from "./kit";
import { F } from "./theme";

/** "View it by appointment", where the truck is kept. Same rules and words as the website (src/lib/viewings.ts and
 *  src/components/Viewings.tsx); the database enforces them and records what the member agreed to (viewingAck). */
export function ViewingBox({ lotId, title, suburb, state, inPerson, auctionAt, open }: {
  lotId: number; title: string; suburb: string; state: string; inPerson: boolean; auctionAt: string | null; open: boolean;
}) {
  const { signedIn } = useSession();
  const [mine, setMine] = useState<Viewing[]>([]);
  const [ack, setAck] = useState("");
  const [form, setForm] = useState(false);
  const load = useCallback(async () => {
    try { const r = await api<{ viewings: Viewing[]; ack: string }>(`/api/viewings?lot=${lotId}`); setMine(r.viewings || []); setAck(r.ack || ""); } catch { /* shown as nothing booked */ }
  }, [lotId]);
  useEffect(() => { void load(); }, [load, signedIn]);
  const current = mine.find((m) => ["requested", "confirmed"].includes(m.status));
  const cancel = (id: string) => {
    const go = async () => { try { await api(`/api/viewings/${id}`, { method: "DELETE" }); } catch { /* reload shows the truth */ } void load(); };
    if (Platform.OS === "web") { if (confirm("Cancel this viewing?")) void go(); return; }
    Alert.alert("Cancel this viewing?", "We'll let the owner know.", [{ text: "Keep it", style: "cancel" }, { text: "Cancel it", style: "destructive", onPress: () => void go() }]);
  };
  if (!inPerson) return <Soft style={{ gap: 8 }} testID="viewing-off"><T v="strong" style={{ fontSize: 17 }}>Viewing.</T><T v="muted">{VIEWING_OFF}</T></Soft>;
  return (
    <Soft style={{ gap: 8 }} testID="viewing">
      <T v="strong" style={{ fontSize: 17 }}>View it by appointment.</T>
      <T v="muted">Where it's kept, near {suburb}{state ? `, ${state}` : ""}. {VIEWING_HOW.join(" ")}</T>
      {current ? (
        <View style={{ gap: 4 }} testID="viewing-booked">
          <T v="body" style={{ fontSize: 15, lineHeight: 21 }}>{current.status === "confirmed" && current.starts_at
            ? <><Text style={{ fontFamily: F.bold }}>Booked: {whenLabel(current.starts_at, state)}</Text>. The address is in the text and email we sent you. Bring photo ID.</>
            : <><Text style={{ fontFamily: F.bold }}>Asked for </Text>{current.slots.map(slotLabel).join("; ")}. We'll agree a time with the owner and text you.</>}</T>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><T v="small">Reference {current.ref}</T><LinkText title="Cancel" onPress={() => cancel(current.id)} style={{ fontSize: 13 }} /></View>
        </View>
      ) : open ? <Button testID="viewing-ask" small kind="dark" title="Ask to view it" onPress={() => setForm(true)} style={{ alignSelf: "flex-start", marginTop: 4 }} />
        : <T v="small">Viewings close the day before the auction.</T>}
      {mine.filter((m) => !["requested", "confirmed"].includes(m.status)).slice(0, 3).map((m) => <T key={m.id} v="small">Viewing {m.ref}: {STATUS_LABEL[m.status] || m.status}{m.status === "declined" && m.staff_note ? `. ${m.staff_note}` : ""}</T>)}
      {form ? <BookSheet lotId={lotId} title={title} auctionAt={auctionAt} ack={ack} onClose={() => setForm(false)} onDone={() => { setForm(false); void load(); }} /> : null}
    </Soft>
  );
}

function BookSheet({ lotId, title, auctionAt, ack, onClose, onDone }: { lotId: number; title: string; auctionAt: string | null; ack: string; onClose: () => void; onDone: () => void }) {
  const { me, signedIn } = useSession();
  const [picked, setPicked] = useState<Slot[]>([]);
  const [note, setNote] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ref, setRef] = useState<string | null>(null);
  const days = viewingDays(auctionAt);
  const path = `/lot/${lotId}`;
  const missing = me?.missing || [];
  const need = !signedIn ? "signin" : missing.some((n) => n !== 4) ? "verify" : null;
  const on = (s: Slot) => picked.some((p) => p.day === s.day && p.part === s.part);
  const toggle = (s: Slot) => {
    setErr("");
    if (on(s)) setPicked(picked.filter((p) => !(p.day === s.day && p.part === s.part)));
    else if (picked.length >= MAX_SLOTS) setErr(`Pick up to ${MAX_SLOTS} times. Untick one to choose another.`);
    else setPicked([...picked, s]);
  };
  const go = (to: string) => { onClose(); router.push(to as never); };
  async function submit() {
    if (!picked.length) return setErr("Pick at least one time that suits you.");
    if (!agree) return setErr("Tick the box to agree to how viewings work first.");
    setBusy(true); setErr("");
    try { const r = await api<{ ref: string }>("/api/viewings", { body: { lotId, slots: picked, note, agree } }); setRef(r.ref); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }
  if (need) {
    return (
      <Sheet visible onClose={onClose} title="Ask to view it." testID="viewing-sheet"
        footer={need === "signin"
          ? <><Button title="Sign in" onPress={() => go(`/signin?next=${encodeURIComponent(path)}`)} /><Button kind="soft" title="Join free" onPress={() => go(`/join?next=${encodeURIComponent(path)}`)} /></>
          : <Button title="Finish setting up" onPress={() => go(`/join?step=${missing[0]}&next=${encodeURIComponent(path)}`)} />}>
        <T v="body" style={{ fontSize: 17, lineHeight: 25 }}>{need === "signin" ? "Sign in or join first. Viewings are for verified members, because the owner is told who's coming."
          : "Viewings are for verified members, because the owner is told who's coming. Finish setting up your account (your details, mobile and ID): it's the same check as bidding."}</T>
      </Sheet>
    );
  }
  if (ref) {
    return (
      <Sheet visible onClose={onDone} title="Thanks, we've got it." testID="viewing-sheet" footer={<Button title="Done" onPress={onDone} />}>
        <T v="body" style={{ fontSize: 17, lineHeight: 25 }}>We'll agree a time with the owner of the {title} and text you, usually within one business day. Your reference is <Text style={{ fontFamily: F.heavy }}>{ref}</Text>.</T>
        <T v="small">The address comes with the confirmation. Bring photo ID, and a mechanic if you like. Looking and listening only: no road test.</T>
      </Sheet>
    );
  }
  return (
    <Sheet visible onClose={onClose} title="Ask to view it." scroll testID="viewing-sheet"
      footer={<Button testID="viewing-submit" title="Ask for the viewing" busy={busy} disabled={!days.length} onPress={submit} />}>
      <T v="muted">Pick up to three times that suit you, up to the day before the auction. We agree one with the owner and text you the address.</T>
      {days.length === 0 ? <Notice kind="bad"><T v="body">The auction is too close to book a viewing. Call us and we'll see what we can do.</T></Notice> : days.map((d) => (
        <View key={d} style={{ gap: 6 }}>
          <T v="strong">{dayLabel(d)}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{PARTS.map(([p, label]) => <Pill key={p} label={label} on={on({ day: d, part: p })} onPress={() => toggle({ day: d, part: p })} testID={`slot-${d}-${p}`} />)}</View>
        </View>
      ))}
      <T v="small">{PARTS.map(([, l, h]) => `${l} ${h}`).join("; ")}</T>
      <Field label="Anything we should know? (optional)" value={note} onChangeText={setNote} maxLength={500} multiline />
      <Check checked={agree} onChange={(v) => { setAgree(v); setErr(""); }} testID="viewing-ack"><T v="body" style={{ fontSize: 14, lineHeight: 20 }}>{ack}</T></Check>
      <LinkText title="Terms, section 5 ›" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms#t-intro`)} style={{ fontSize: 14 }} />
      {err ? <Notice kind="bad"><T v="body">{err}</T></Notice> : null}
    </Sheet>
  );
}
