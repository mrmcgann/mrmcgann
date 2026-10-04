import { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { dateLong, money } from "@/lib/format";
import { api, errText } from "~/lib/api";
import { SITE } from "~/lib/env";
import { downloadAndShare, pickPhotos, uploadPhotos, type Picked } from "~/lib/files";
import { usePayments } from "~/lib/pay";
import { useSession } from "~/lib/session";
import type { InvoiceDetail } from "~/lib/types";
import { Button, Empty, Field, LineItem, LinkText, Loading, Notice, Screen, Segmented, Select, Sheet, Soft, T } from "~/ui/kit";
import { InsureBox } from "~/ui/Partners";
import { TransferStep } from "~/ui/Transfer";
import { C, F } from "~/ui/theme";

const TIMES: [string, string][] = [["Morning (8 am – 12 pm)", "Morning (8 am – 12 pm)"], ["Afternoon (12 – 5 pm)", "Afternoon (12 – 5 pm)"], ["Evening (5 – 7 pm)", "Evening (5 – 7 pm)"]];
const REASONS: [string, string][] = [
  ["identity", "Wrong make, model, year or VIN"], ["transmission_fuel", "Wrong transmission or fuel type"], ["write_off_stolen", "Undisclosed write-off or stolen status"],
  ["finance", "Undisclosed finance owing"], ["odometer", "Odometer materially different"], ["missing_feature", "A listed key feature is missing"],
  ["undisclosed_damage", "Major damage not shown in the listing"], ["other", "Something else"],
];

export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useSession();
  const { pay } = usePayments();
  const [d, setD] = useState<InvoiceDetail | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try { setD(await api<InvoiceDetail>(`/api/invoices/${id}`)); setErr(""); } catch (e) { setErr(errText(e)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);
  // While payment is being taken, check again every few seconds.
  useEffect(() => {
    if (!d || !["pending_charge", "charging"].includes(d.invoice.status)) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [d, load]);

  async function payNow() {
    setBusy(true); setMsg(null);
    try {
      const r = await api<{ test?: boolean; paid?: boolean; clientSecret?: string }>(`/api/invoices/${id}/pay`, { method: "POST" });
      if (r.clientSecret) {
        const res = await pay(r.clientSecret);
        if ("error" in res) setMsg({ ok: false, text: res.error });
        if ("ok" in res) { await api(`/api/invoices/${id}/confirm`, { method: "POST" }).catch(() => undefined); setMsg({ ok: true, text: "Paid. Thank you." }); }
      }
      await load();
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
    setBusy(false);
  }

  if (err && !d) return <Screen><Empty title="Can't load this invoice." sub={err}><Button title="Try again" onPress={load} /></Empty></Screen>;
  if (!d) return <Loading />;
  const inv = d.invoice;
  const c = d.collection;
  const paidCard = ["paid", "deposit_paid"].includes(inv.status);
  const fullyPaid = inv.status === "paid";
  // Collection is booked once the vehicle is in the buyer's name (servers without the transfer step: straight away).
  const transfer = d.transfer ?? null;
  const owned = !("transfer" in d) || transfer?.status === "complete";

  return (
    <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} testID="invoice">
      <T v="d3">{inv.lots.title}.</T>
      <View style={s.card}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10 }}>
          <View style={{ flex: 1 }}><T v="strong" style={{ fontSize: 18 }}>Tax invoice {inv.ref}</T><T v="small">{d.seller.legalName} · ABN {d.seller.abn}</T></View>
          <T v="small">{dateLong(inv.created_at)}</T>
        </View>
        <T v="small">Billed to {me?.profile?.company_name ? `${me.profile.company_name} (ABN ${me.profile.abn}) · ` : ""}{[me?.profile?.first_name, me?.profile?.last_name].filter(Boolean).join(" ")}. Lot {inv.lot_id}{inv.lots.vin ? ` · VIN ${inv.lots.vin}` : ""}.</T>
        <View>
          {d.lines.map(([k, v]) => <LineItem key={k} k={k} v={money(v, true)} />)}
          <View style={s.rule} />
          <LineItem k="Total" v={money(d.total, true)} bold />
          <LineItem k="Includes GST of" v={money(d.gstTotal, true)} />
        </View>
        <T v="small">{inv.lots.gst_status === "inc" ? "The vehicle price includes GST (the seller is GST-registered)." : "Private sale: no GST on the vehicle price."} Sold by Tyrebiter as agent for the seller. No card surcharge.</T>
        <LinkText title="Download the PDF ›" onPress={() => downloadAndShare(d.pdfUrl, `${inv.ref}.pdf`).catch((e) => setMsg({ ok: false, text: errText(e) }))} />
      </View>

      {msg ? <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice> : null}
      {["pending_charge", "charging"].includes(inv.status) ? <Notice>We're taking payment now. This updates within a minute.</Notice> : null}
      {inv.status === "paid" ? <Notice kind="ok">{inv.mode === "card" ? `${money(inv.card_amount, true)} was charged to your card. Paid in full.` : "Deposit and balance received. Paid in full."}</Notice> : null}
      {inv.status === "deposit_paid" && d.bank ? (
        <Soft bg={C.sun}>
          <T v="strong">Deposit of {money(inv.card_amount, true)} paid. Balance due: {money(inv.balance_due, true)}.</T>
          <T v="body">Pay by bank transfer by {dateLong(inv.due_at)}.</T>
          {[["Account name", d.bank.name], ["BSB", d.bank.bsb], ["Account", d.bank.account], ["Reference", d.bank.reference], ...(d.bank.payId ? [["PayID", d.bank.payId]] : [])].map(([k, v]) => (
            <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <T v="body">{k}: <Text style={{ fontFamily: F.heavy }}>{v}</Text></T>
              <Text accessibilityRole="button" onPress={() => Clipboard.setStringAsync(v).then(() => setMsg({ ok: true, text: `${k} copied.` }))} style={s.copy}>Copy</Text>
            </View>
          ))}
          <Notice kind="bad"><T v="body" style={{ fontSize: 14 }}><Text style={{ fontFamily: F.bold }}>Scam warning: </Text>we will never change these bank details by email, SMS or phone. If you get a message saying our details have changed, don't pay. Call us on {d.seller.phone} first. Never pay the seller directly.</T></Notice>
        </Soft>
      ) : null}
      {inv.status === "payment_failed" ? (
        <Soft bg={C.badBg}>
          <T v="strong">We couldn't charge your card{inv.failure_reason ? ` (${inv.failure_reason})` : ""}.</T>
          <T v="body">Pay {money(inv.card_amount, true)} within 1 business day, or the sale may be cancelled with a cancellation fee.</T>
          <Button title="Pay now" busy={busy} onPress={payNow} />
        </Soft>
      ) : null}
      {inv.status === "cancelled" ? <Notice kind="bad">{`This sale was cancelled${inv.cancel_fee ? ` with a ${money(inv.cancel_fee)} cancellation fee` : ""}.`}</Notice> : null}

      {fullyPaid && transfer ? <TransferStep invoiceId={inv.id} invoiceRef={inv.ref} t={transfer} title={inv.lots.title} consultantPhone={d.seller.phone} certificateUrl={d.certificateUrl} onDone={load} /> : null}

      {paidCard ? (
        <Soft>
          <T v="h">Collection.</T>
          {!fullyPaid ? <T v="body">Once your balance clears and the vehicle is in your name, book a time here. The address is sent once the time is confirmed.</T> : null}
          {fullyPaid && !c && !owned ? <T v="muted">Book a time once the transfer of ownership above is done. The address is sent once your collection time is confirmed.</T> : null}
          {fullyPaid && ((!c && owned) || c?.status === "requested") ? (
            <>
              {!c ? <T v="body">Collect from the seller in {inv.lots.suburb}, {inv.lots.state}{inv.collect_by ? ` by ${dateLong(inv.collect_by)}` : ""}. Pick a time and we'll confirm it with the seller.</T> : null}
              <BookCollection invoiceId={inv.id} existing={c} onDone={load} />
            </>
          ) : null}
          {c?.status === "confirmed" ? (
            <>
              <Notice kind="ok">{`Confirmed: ${c.confirmed_for}`}</Notice>
              <T v="body">Address: <Text style={{ fontFamily: F.bold }}>{d.address || "we'll text it to you"}</Text></T>
              {d.address ? <LinkText title="Open in Maps ›" onPress={() => Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(d.address!)}`)} /> : null}
              <T v="body">Your release code. Give it to the seller only when you{c.collector_name ? ` (or ${c.collector_name})` : ""} are with the vehicle:</T>
              <Text testID="release-code" selectable style={s.code}>{c.release_code}</Text>
              {[`Bring photo ID${c.collector_name ? ` (${c.collector_name} brings theirs)` : ""} and this invoice.`, "Check the vehicle against the listing before you take the keys. Photograph anything that's different.", "Give the seller the code. They enter it on their phone to confirm handover.", "From handover, the vehicle is your responsibility. Arrange insurance before you drive or move it."].map((t, i) => <T key={i} v="body">{i + 1}. {t}</T>)}
            </>
          ) : null}
          {c?.status === "collected" ? <Notice kind="ok">{`Collected ${dateLong(c.collected_at)}.${inv.claim_until && new Date(inv.claim_until).getTime() > Date.now() ? ` If something is materially different from the listing, you can claim until ${dateLong(inv.claim_until)}.` : ""}`}</Notice> : null}
          {d.overdueDays > 0 && !inv.collected_at ? <Notice kind="bad">{`The collection window ended ${dateLong(inv.collect_by)}. Storage of ${money(d.storagePerDay)} a day applies (${money(d.overdueDays * d.storagePerDay)} so far), payable before release.`}</Notice> : null}
        </Soft>
      ) : null}

      {paidCard && !inv.collected_at && inv.status !== "cancelled" ? <InsureBox lotId={inv.lot_id} balanceOwing={!fullyPaid} /> : null}

      {d.claims.length ? (
        <Soft>
          <T v="strong">Your claims</T>
          {d.claims.map((x) => <T key={x.id} v="body">{x.status} · lodged {dateLong(x.created_at)}{x.resolution ? `: ${x.resolution}` : ""}</T>)}
        </Soft>
      ) : null}
      {d.canClaim ? <ClaimBox invoiceId={inv.id} userId={me?.user?.id || ""} until={inv.claim_until || null} onDone={load} /> : null}
      <T v="small">Questions about this invoice? Call {d.seller.phone} or email {d.seller.supportEmail}.</T>
      <LinkText title="Collection and claims rules ›" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms#t-title`)} />
    </Screen>
  );
}

function BookCollection({ invoiceId, existing, onDone }: { invoiceId: string; existing: InvoiceDetail["collection"]; onDone: () => void }) {
  const days: [string, string][] = [];
  for (let i = 1; days.length < 7 && i < 14; i++) {
    const dd = new Date(Date.now() + i * 86400000);
    if (dd.getDay() !== 0) { const l = dd.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" }); days.push([l, l]); }
  }
  const [day, setDay] = useState(existing?.preferred_day || days[0][0]);
  const [time, setTime] = useState(existing?.preferred_time || TIMES[0][0]);
  const [who, setWho] = useState<"me" | "someone" | "carrier">(existing?.collector_name ? "someone" : "me");
  const [name, setName] = useState(existing?.collector_name || "");
  const [mobile, setMobile] = useState("");
  const [ref, setRef] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setErr("");
    try {
      await api("/api/collections", { body: { invoiceId, day, time, collectorName: who === "me" ? "" : name, collectorMobile: who === "me" ? "" : mobile, carrierRef: who === "carrier" ? ref : "" } });
      onDone();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }
  return (
    <View style={{ gap: 12 }}>
      {existing ? <Notice>{`Requested: ${existing.preferred_day}, ${existing.preferred_time.toLowerCase()}. We're confirming it with the seller. You can change it below until then.`}</Notice> : null}
      <Select label="Day" value={day} options={days} placeholder="Pick a day" onChange={(v) => setDay(v || days[0][0])} />
      <Select label="Time" value={time} options={TIMES} placeholder="Pick a time" onChange={(v) => setTime(v || TIMES[0][0])} />
      <Segmented options={[["me", "I'll collect"], ["someone", "Someone else"], ["carrier", "Transport co."]]} value={who} onChange={setWho} />
      {who !== "me" ? <>
        <Field label={who === "carrier" ? "Driver or company name" : "Their full name (as on their licence)"} value={name} onChangeText={setName} inputStyle={{ backgroundColor: "#FFFFFF" }} />
        <Field label="Their mobile (we text them the code)" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" inputStyle={{ backgroundColor: "#FFFFFF" }} />
      </> : null}
      {who === "carrier" ? <Field label="Carrier booking reference" value={ref} onChangeText={setRef} inputStyle={{ backgroundColor: "#FFFFFF" }} /> : null}
      <T v="small">Whoever collects must show photo ID matching the name here, and give the seller your release code.</T>
      {err ? <Notice kind="bad">{err}</Notice> : null}
      <Button kind="dark" title={existing ? "Update request" : "Request this time"} busy={busy} onPress={submit} />
    </View>
  );
}

function ClaimBox({ invoiceId, userId, until, onDone }: { invoiceId: string; userId: string; until: string | null; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0][0]);
  const [details, setDetails] = useState("");
  const [photos, setPhotos] = useState<Picked[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (details.trim().length < 20) { setErr("Tell us what the listing said and what you found (at least 20 characters)."); return; }
    setBusy(true); setErr("");
    try {
      const paths = photos.length ? await uploadPhotos("claim-photos", `${userId}/${invoiceId}`, photos) : [];
      await api("/api/claims", { body: { invoiceId, reason, details, photos: paths } });
      setOpen(false); onDone();
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }
  return (
    <>
      <LinkText title="Something materially different from the listing? Make a claim ›" onPress={() => setOpen(true)} />
      <Sheet visible={open} onClose={() => setOpen(false)} title="Make a claim" scroll footer={<Button title="Lodge claim" busy={busy} onPress={submit} />}>
        <T v="muted">Claims cover material differences from the listing, not general wear or faults a walkaround couldn't reveal. {until ? `Lodge by ${dateLong(until)}. ` : ""}Don't modify, register or use the vehicle while we review it.</T>
        <Select label="What's different?" value={reason} options={REASONS} onChange={(v) => setReason(v || "other")} />
        <Field label="Details" value={details} onChangeText={setDetails} multiline placeholder="What the listing said, and what you found." />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Button small kind="soft" title="Add photos" onPress={async () => setPhotos([...photos, ...(await pickPhotos(12 - photos.length))].slice(0, 12))} />
          <Button small kind="soft" title="Take a photo" onPress={async () => setPhotos([...photos, ...(await pickPhotos(1, true))].slice(0, 12))} />
        </View>
        {photos.length ? <T v="small">{photos.length} photo{photos.length === 1 ? "" : "s"} added</T> : null}
        {err ? <Notice kind="bad">{err}</Notice> : null}
      </Sheet>
    </>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 24, borderWidth: 1, borderColor: C.line, padding: 18, gap: 12 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginVertical: 6 },
  code: { fontFamily: F.heavy, fontSize: 44, letterSpacing: 10, textAlign: "center", color: C.ink, backgroundColor: "#FFFFFF", borderRadius: 18, paddingVertical: 16, overflow: "hidden" },
  copy: { fontFamily: F.bold, color: C.ink, opacity: 0.7, fontSize: 14 },
});
