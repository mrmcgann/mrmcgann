import { useCallback, useEffect, useState } from "react";
import { Alert, Platform, Text, View } from "react-native";
import { router } from "expo-router";
import { KIND_LABEL, MAX_SLOTS, PARTS, STATUS_LABEL, dayLabel, slotLabel, viewingDays, whenLabel, type Slot, type Viewing, type ViewingKind } from "@/lib/viewings";
import { api, errText } from "~/lib/api";
import { useSession } from "~/lib/session";
import { Button, Field, LinkText, Notice, Pill, Sheet, Soft, T } from "./kit";
import { F } from "./theme";

/** "See it before you bid": a free video walkaround, or an in-person viewing strictly by appointment (when the seller
 *  allows it). Same rules and wording as the website (src/lib/viewings.ts); the database enforces them. */
export function Viewings({ lotId, title, suburb, state, inPerson, endsAt, auction, open }: {
  lotId: number; title: string; suburb: string; state: string; inPerson: boolean; endsAt: string | null; auction: boolean; open: boolean;
}) {
  const { signedIn } = useSession();
  const [mine, setMine] = useState<Viewing[]>([]);
  const [form, setForm] = useState<ViewingKind | null>(null);
  const load = useCallback(async () => {
    if (!signedIn) { setMine([]); return; }
    try { const r = await api<{ viewings: Viewing[] }>(`/api/viewings?lot=${lotId}`); setMine(r.viewings || []); } catch { /* shown as nothing booked */ }
  }, [lotId, signedIn]);
  useEffect(() => { void load(); }, [load]);
  const openOf = (k: ViewingKind) => mine.find((m) => m.kind === k && ["requested", "confirmed"].includes(m.status));
  const cancel = (id: string) => {
    const go = async () => { try { await api(`/api/viewings/${id}`, { method: "DELETE" }); } catch { /* reload shows the truth */ } void load(); };
    if (Platform.OS === "web") { if (confirm("Cancel this booking?")) void go(); return; }
    Alert.alert("Cancel this booking?", undefined, [{ text: "Keep it", style: "cancel" }, { text: "Cancel it", style: "destructive", onPress: () => void go() }]);
  };
  const card = (k: ViewingKind, head: string, body: string, button: string, available: boolean, unavailable?: string) => {
    const cur = openOf(k);
    return (
      <Soft style={{ gap: 8 }} testID={`viewing-${k}`}>
        <T v="strong" style={{ fontSize: 17 }}>{head}</T>
        <T v="muted">{body}</T>
        {cur ? (
          <View style={{ gap: 4 }} testID="viewing-booked">
            <T v="body" style={{ fontSize: 15, lineHeight: 21 }}>{cur.status === "confirmed" && cur.starts_at
              ? <><Text style={{ fontFamily: F.bold }}>Booked: {whenLabel(cur.starts_at)}</Text> (Brisbane time). {cur.kind === "video" ? "We'll video-call your verified mobile." : "The address is in the text and email we sent you."}</>
              : <><Text style={{ fontFamily: F.bold }}>Asked for </Text>{cur.slots.map(slotLabel).join(" · ")}. We'll text you to confirm a time.</>}</T>
            <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><T v="small">Reference {cur.ref}</T><LinkText title="Cancel" onPress={() => cancel(cur.id)} style={{ fontSize: 13 }} /></View>
          </View>
        ) : available && open ? <Button testID={`book-${k}`} small kind="dark" title={button} onPress={() => setForm(k)} style={{ alignSelf: "flex-start", marginTop: 4 }} />
          : unavailable ? <T v="small">{unavailable}</T> : null}
      </Soft>
    );
  };
  return (
    <View style={{ gap: 12 }}>
      {card("video", "Free video walkaround.", "Your Tyrebiter consultant (or the seller) video-calls you at the vehicle and shows you whatever you ask: start it up, look underneath, run the lights, open everything. Free, about 15 minutes.", "Book a video walkaround", true)}
      {card("in_person", "View it in person, by appointment.", `At the vehicle's location near ${suburb}, ${state}, strictly by appointment, with the seller or your consultant there. For verified buyers: bring photo ID. Viewing only, no test drives.`, "Ask for a viewing", inPerson,
        inPerson ? undefined : "The seller hasn't offered in-person viewings for this vehicle. Book a video walkaround or a mechanical inspection instead.")}
      {mine.filter((m) => !["requested", "confirmed"].includes(m.status)).slice(0, 3).map((m) => <T key={m.id} v="small">{KIND_LABEL[m.kind]} {m.ref}: {STATUS_LABEL[m.status] || m.status}{m.status === "declined" && m.staff_note ? `. ${m.staff_note}` : ""}</T>)}
      {form ? <BookSheet kind={form} lotId={lotId} title={title} endsAt={endsAt} auction={auction} onClose={() => setForm(null)} onDone={() => { setForm(null); void load(); }} /> : null}
    </View>
  );
}

function BookSheet({ kind, lotId, title, endsAt, auction, onClose, onDone }: { kind: ViewingKind; lotId: number; title: string; endsAt: string | null; auction: boolean; onClose: () => void; onDone: () => void }) {
  const { me, signedIn } = useSession();
  const [picked, setPicked] = useState<Slot[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ref, setRef] = useState<string | null>(null);
  const days = viewingDays(endsAt, auction);
  const path = `/lot/${lotId}`;
  const missing = me?.missing || [];
  const need = !signedIn ? "signin" : missing.includes(2) || missing.includes(3) ? "mobile" : kind === "in_person" && missing.some((n) => n !== 4) ? "verify" : null;
  const heading = kind === "video" ? "Book a video walkaround." : "Ask for a viewing.";
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
    setBusy(true); setErr("");
    try { const r = await api<{ ref: string }>("/api/viewings", { body: { lotId, kind, slots: picked, note } }); setRef(r.ref); } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }
  if (need) {
    return (
      <Sheet visible onClose={onClose} title={heading} testID="viewing-sheet"
        footer={need === "signin"
          ? <><Button title="Sign in" onPress={() => go(`/signin?next=${encodeURIComponent(path)}`)} /><Button kind="soft" title="Join free" onPress={() => go(`/join?next=${encodeURIComponent(path)}`)} /></>
          : <Button title="Finish setting up" onPress={() => go(`/join?step=${missing[0]}&next=${encodeURIComponent(path)}`)} />}>
        <T v="body" style={{ fontSize: 17, lineHeight: 25 }}>{need === "signin" ? "Sign in or join first, so we can confirm the time with you."
          : need === "mobile" ? "Add your details and verify your mobile first, so we can call you about the time."
          : "In-person viewings are for verified buyers. Finish setting up your account (your details, mobile and ID): it's the same check as bidding."}</T>
      </Sheet>
    );
  }
  if (ref) {
    return (
      <Sheet visible onClose={onDone} title="Thanks, we've got it." testID="viewing-sheet" footer={<Button title="Done" onPress={onDone} />}>
        <T v="body" style={{ fontSize: 17, lineHeight: 25 }}>We'll text you to confirm {kind === "video" ? "a time for your video walkaround" : "a viewing time"} of the {title}, usually within one business day. Your reference is <Text style={{ fontFamily: F.heavy }}>{ref}</Text>.</T>
      </Sheet>
    );
  }
  return (
    <Sheet visible onClose={onClose} title={heading} scroll testID="viewing-sheet"
      footer={<Button testID="viewing-submit" title={kind === "video" ? "Book the walkaround" : "Ask for the viewing"} busy={busy} disabled={!days.length} onPress={submit} />}>
      <T v="muted">Pick up to three times that suit you. We'll confirm one by text and email.</T>
      {days.length === 0 ? <Notice kind="bad"><T v="body">Bidding closes too soon to book. Call us and we'll try to fit you in.</T></Notice> : days.map((d) => (
        <View key={d} style={{ gap: 6 }}>
          <T v="strong">{dayLabel(d)}</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{PARTS.map(([p, label]) => <Pill key={p} label={label} on={on({ day: d, part: p })} onPress={() => toggle({ day: d, part: p })} testID={`slot-${d}-${p}`} />)}</View>
        </View>
      ))}
      <T v="small">{PARTS.map(([, l, h]) => `${l} ${h}`).join(" · ")}</T>
      <Field label={kind === "video" ? "Anything you'd like us to show you? (optional)" : "Anything we should know? (optional)"} value={note} onChangeText={setNote} maxLength={500} multiline />
      {err ? <Notice kind="bad"><T v="body">{err}</T></Notice> : null}
    </Sheet>
  );
}
