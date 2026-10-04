import { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { api, errText } from "~/lib/api";
import { useSession } from "~/lib/session";
import type { MyLotState, Partner } from "~/lib/types";
import { InspectionSheet } from "./Partners";
import { Button, Field, LinkText, Notice, Select, Sheet, Soft, T } from "./kit";
import { C } from "./theme";

/** Transport quote to the buyer's postcode. */
export function QuoteBox({ lotId, partner, title }: { lotId: number; partner?: Partner | null; title?: string }) {
  const [sheet, setSheet] = useState(false);
  if (partner) {
    return (
      <Soft>
        <T v="strong">Need it delivered?</T>
        <T v="muted">{partner.blurb || `${partner.name} can collect it and deliver it to you.`}{partner.turnaround ? ` ${partner.turnaround}.` : ""}</T>
        <Button testID="transport-quote" small kind="dark" title="Get a transport quote" onPress={() => setSheet(true)} style={{ alignSelf: "flex-start" }} />
        <T v="small">From {partner.name}, an independent carrier. {partner.commission_note || ""}</T>
        <InspectionSheet visible={sheet} onClose={() => setSheet(false)} partner={partner} lotId={lotId} vehicle={`${title || "This vehicle"} (lot ${lotId})`} kind="transport" />
      </Soft>
    );
  }
  return <TeamQuote lotId={lotId} />;
}

function TeamQuote({ lotId }: { lotId: number }) {
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
