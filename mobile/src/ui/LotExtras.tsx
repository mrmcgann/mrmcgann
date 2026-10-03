import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { api, errText } from "~/lib/api";
import { useSession } from "~/lib/session";
import type { MyLotState } from "~/lib/types";
import { Button, Field, LinkText, Notice, Select, Sheet, Soft, T } from "./kit";
import { C } from "./theme";

const TIMES: [string, string][] = [["Morning (8 am – 12 pm)", "Morning (8 am – 12 pm)"], ["Afternoon (12 – 5 pm)", "Afternoon (12 – 5 pm)"], ["Evening (5 – 7 pm)", "Evening (5 – 7 pm)"]];

/** Book a viewing at the seller's place (ID-verified buyers only). */
export function InspectionBox({ lotId, suburb, state, endsAt, mine, path }: { lotId: number; suburb: string; state: string; endsAt: string | null; mine: MyLotState | null; path: string }) {
  const { signedIn, me } = useSession();
  const verified = signedIn && !(me?.missing || []).length;
  const [open, setOpen] = useState(false);
  const days: [string, string][] = [];
  for (let i = 1; i <= 6; i++) {
    const d = new Date(Date.now() + i * 86400000);
    if (!endsAt || d.getTime() < new Date(endsAt).getTime()) { const l = d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" }); days.push([l, l]); }
  }
  const [day, setDay] = useState(days[0]?.[0] || "");
  const [time, setTime] = useState(TIMES[0][0]);
  const [done, setDone] = useState(mine?.inspection ? `${mine.inspection.day}, ${mine.inspection.time.toLowerCase()}` : null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function book() {
    setBusy(true); setErr("");
    try { await api("/api/inspections", { body: { lotId, day, time } }); setDone(`${day}, ${time.toLowerCase()}`); setOpen(false); }
    catch (e) { setErr(errText(e)); }
    setBusy(false);
  }
  return (
    <Soft>
      <T v="strong">Inspect before you bid.</T>
      <T v="muted">It's at the seller's place in {suburb}, {state}. We book ID-verified buyers in and confirm the time with the seller.</T>
      {done ? <Notice kind="ok">{`Requested: ${done}. We'll text you once the seller confirms, with the address.`}</Notice> : (
        <Button small kind="dark" title={days.length ? "Book an inspection" : "Ends too soon to book"} disabled={!days.length} style={{ alignSelf: "flex-start" }}
          onPress={() => { if (!signedIn) router.push(`/join?next=${encodeURIComponent(path)}`); else if (!verified) router.push(`/join?step=${me?.missing?.[0] || 2}&next=${encodeURIComponent(path)}`); else setOpen(true); }} />
      )}
      <Sheet visible={open} onClose={() => setOpen(false)} title="Book an inspection"
        footer={<Button title="Request this time" busy={busy} onPress={book} />}>
        <Select label="Day" value={day} options={days} placeholder="Pick a day" onChange={(v) => setDay(v || days[0]?.[0] || "")} />
        <Select label="Time" value={time} options={TIMES} placeholder="Pick a time" onChange={(v) => setTime(v || TIMES[0][0])} />
        <T v="small">Bring your driver licence. The seller only shows the vehicle to the person booked.</T>
        {err ? <Notice kind="bad">{err}</Notice> : null}
      </Sheet>
    </Soft>
  );
}

/** Transport quote to the buyer's postcode. */
export function QuoteBox({ lotId }: { lotId: number }) {
  const { me } = useSession();
  const [pc, setPc] = useState("");
  const [email, setEmail] = useState(me?.user?.email || "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function send() {
    if (!/^\d{4}$/.test(pc)) { setMsg({ ok: false, text: "Enter a 4-digit postcode." }); return; }
    setBusy(true);
    try { await api("/api/quotes", { body: { lotId, postcode: pc, email } }); setMsg({ ok: true, text: "Thanks. We'll email a firm transport quote within 1 business day." }); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); }
    setBusy(false);
  }
  return (
    <Soft>
      <T v="strong">Need it delivered?</T>
      <T v="muted">We can arrange transport anywhere in Australia once you've paid.</T>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Field label="Postcode" value={pc} onChangeText={(t) => setPc(t.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" style={{ width: 110 }} inputStyle={{ backgroundColor: "#FFFFFF" }} />
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" style={{ flex: 1 }} inputStyle={{ backgroundColor: "#FFFFFF" }} />
      </View>
      {msg ? <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice> : null}
      <Button small kind="dark" title="Get a transport quote" busy={busy} onPress={send} style={{ alignSelf: "flex-start" }} />
    </Soft>
  );
}

/** Ask the seller a question (answers are published on the listing). */
export function QuestionBox({ lotId, mine, open, path }: { lotId: number; mine: MyLotState | null; open: boolean; path: string }) {
  const { signedIn } = useSession();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function send() {
    if (text.trim().length < 5) { setMsg({ ok: false, text: "Type your question first." }); return; }
    setBusy(true);
    try { await api("/api/questions", { body: { lotId, question: text.trim() } }); setText(""); setMsg({ ok: true, text: "Sent. We'll pass it to the seller and publish the answer here." }); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); }
    setBusy(false);
  }
  return (
    <View style={{ gap: 12 }}>
      {(mine?.questions || []).map((q, i) => (
        <Soft key={i} bg="#FFFFFF" style={{ borderWidth: 1, borderColor: C.line }}>
          <T v="strong">Your question: {q.question}</T>
          <T v="muted">{q.answer ? q.answer : "Waiting for the seller's answer."}</T>
        </Soft>
      ))}
      {open ? (signedIn ? (
        <Soft>
          <Field label="Ask the seller" value={text} onChangeText={setText} multiline maxLength={600} placeholder="e.g. Has the timing belt been done? Is there a spare key?" inputStyle={{ backgroundColor: "#FFFFFF" }} />
          <T v="small">Please leave out phone numbers and emails. Questions go through Tyrebiter.</T>
          {msg ? <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice> : null}
          <Button small kind="dark" title="Send question" busy={busy} onPress={send} style={{ alignSelf: "flex-start" }} />
        </Soft>
      ) : <LinkText title="Join or sign in to ask the seller a question ›" onPress={() => router.push(`/join?next=${encodeURIComponent(path)}`)} />) : null}
    </View>
  );
}

const REPORTS: [string, string][] = [["Suspicious bidding", "Suspicious bidding"], ["Listing is inaccurate", "Listing is inaccurate"], ["Seller contacted me off the site", "Seller contacted me off the site"], ["Something else", "Something else"]];
export function ReportLink({ lotId, path }: { lotId: number; path: string }) {
  const { signedIn } = useSession();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(REPORTS[0][0]);
  const [details, setDetails] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function send() {
    setBusy(true); setErr("");
    try { await api("/api/reports", { body: { lotId, type, details } }); setDone(true); setOpen(false); }
    catch (e) { setErr(errText(e)); }
    setBusy(false);
  }
  if (done) return <T v="small">Thanks. Our team will review your report.</T>;
  return (
    <>
      <LinkText title="Report a concern about this auction ›" color={C.muted} onPress={() => (signedIn ? setOpen(true) : router.push(`/join?next=${encodeURIComponent(path)}`))} />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Report a concern" footer={<Button title="Send report" busy={busy} onPress={send} />}>
        <T v="muted">We review every report. Sellers and their associates aren't allowed to bid on their own vehicles.</T>
        <Select label="What's the concern?" value={type} options={REPORTS} onChange={(v) => setType(v || REPORTS[0][0])} />
        <Field label="Details" value={details} onChangeText={setDetails} multiline />
        {err ? <Notice kind="bad">{err}</Notice> : null}
      </Sheet>
    </>
  );
}
