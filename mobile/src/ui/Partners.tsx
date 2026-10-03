import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { consentText, isPostcode, REFERRER_NOTE } from "@/lib/partners";
import { COMPARISON_WARNING } from "@/lib/finance";
import { router } from "expo-router";
import { money } from "@/lib/format";
import { api, errText } from "~/lib/api";
import { SITE } from "~/lib/env";
import { useSession } from "~/lib/session";
import type { AppConsultant, FinanceEstimate, Partner } from "~/lib/types";
import { Button, Check, Field, LinkText, Notice, Sheet, Soft, T } from "./kit";
import { C, F } from "./theme";

const open = (path: string) => WebBrowser.openBrowserAsync(`${SITE}${path}`);

/** Listing: an independent mobile inspection is the only way to inspect before bidding. */
export function MobileInspection({ lotId, title, partner, consultantPhone, canOrder }: {
  lotId: number; title: string; partner: Partner | null; consultantPhone: string | null; canOrder: boolean;
}) {
  const [form, setForm] = useState(false);
  return (
    <Soft style={{ gap: 8 }}>
      <T v="strong" style={{ fontSize: 17 }}>Mobile inspection.</T>
      <T v="muted">
        In-person viewings aren't available.{" "}
        {partner
          ? <>An independent mechanic from {partner.name} can inspect the vehicle where it is and send you a written report with photos{partner.price_from ? <>, from <Text style={{ fontFamily: F.bold, color: C.ink }}>{money(partner.price_from)}</Text></> : null}.</>
          : `Your consultant can arrange an independent inspection${consultantPhone ? ` on ${consultantPhone}` : ""}.`}
      </T>
      {partner && canOrder ? <Button testID="order-inspection" small kind="dark" title="Order a mobile inspection" onPress={() => setForm(true)} style={{ alignSelf: "flex-start", marginTop: 4 }} /> : null}
      {partner?.turnaround && canOrder ? <T v="small">{partner.turnaround}. Allow time before bidding closes.</T> : null}
      {partner ? <InspectionSheet visible={form} onClose={() => setForm(false)} partner={partner} lotId={lotId} vehicle={`${title} (lot ${lotId})`} /> : null}
    </Soft>
  );
}

/** The order form. Only signed-in members with a fully verified account can order (it sends a
 *  mechanic to the seller's address); their verified name, mobile and email are what's shared,
 *  with explicit consent, through /api/leads. */
function InspectionSheet({ visible, onClose, partner, lotId, vehicle }: { visible: boolean; onClose: () => void; partner: Partner; lotId: number; vehicle: string }) {
  const { me, signedIn } = useSession();
  const p = me?.profile;
  const missing = me?.missing || [];
  const [postcode, setPostcode] = useState(p?.postcode || "");
  const [notes, setNotes] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ref, setRef] = useState<string | null>(null);
  const path = `/lot/${lotId}`;

  async function submit() {
    if (postcode.trim() && !isPostcode(postcode.trim())) return setErr("Enter a 4-digit postcode.");
    if (!agree) return setErr("Tick the box so we can pass your details on.");
    setBusy(true); setErr("");
    try {
      const r = await api<{ ok: boolean; ref: string }>("/api/leads", { body: {
        partnerId: partner.id, kind: "inspection", lotId, postcode: postcode.trim() || undefined, consent: true, details: notes.trim() ? { notes: notes.trim() } : {},
      } });
      setRef(r.ref);
    } catch (e) { setErr(errText(e)); }
    setBusy(false);
  }
  const intro = [partner.blurb, partner.price_from ? `From ${money(partner.price_from)}, paid to ${partner.name}.` : null, partner.turnaround ? `${partner.turnaround}.` : null].filter(Boolean).join(" ");
  const close = () => { onClose(); if (ref) { setRef(null); setAgree(false); setNotes(""); } };
  const go = (to: string) => { onClose(); router.push(to as never); };

  if (!signedIn || missing.length) {
    return (
      <Sheet visible={visible} onClose={onClose} title="Order a mobile inspection." testID="inspection-sheet"
        footer={!signedIn
          ? <><Button testID="lead-signin" title="Sign in" onPress={() => go(`/signin?next=${encodeURIComponent(path)}`)} /><Button kind="soft" title="Join free" onPress={() => go(`/join?next=${encodeURIComponent(path)}`)} /></>
          : <Button testID="lead-verify" title="Continue" onPress={() => go(`/join?step=${missing[0]}&next=${encodeURIComponent(path)}`)} />}>
        <T v="body" style={{ fontSize: 17, lineHeight: 25 }}>{!signedIn
          ? "Sign in or join first. Inspections are for verified members, because the inspector goes to the seller's address."
          : "Finish verifying your account (mobile, card and ID) before ordering an inspection. It's the same check as bidding."}</T>
      </Sheet>
    );
  }
  return (
    <Sheet visible={visible} onClose={close} title={ref ? "Sent." : "Order a mobile inspection."} scroll testID="inspection-sheet"
      footer={ref ? <Button title="Done" onPress={close} /> : <Button testID="lead-submit" title="Order the inspection" busy={busy} onPress={submit} />}>
      {ref ? (
        <T v="body" style={{ fontSize: 17, lineHeight: 25 }}>{partner.name} will be in touch to confirm the price and a time. The report comes to you by email. Your reference is <Text style={{ fontFamily: F.heavy }}>{ref}</Text>. We've emailed you a copy.</T>
      ) : (
        <>
          {intro ? <T v="muted">{intro}</T> : null}
          <Notice kind="info"><T v="body" style={{ fontSize: 14, lineHeight: 20 }}><Text style={{ fontFamily: F.bold }}>Vehicle: </Text>{vehicle}</T></Notice>
          <View style={{ gap: 2 }}>
            <T v="small">We'll share your verified details:</T>
            <T v="body">{[p?.first_name, p?.last_name].filter(Boolean).join(" ")} · {p?.mobile} · {me?.user?.email}</T>
          </View>
          <Field testID="lead-postcode" label="Postcode (optional)" value={postcode} onChangeText={(t) => setPostcode(t.replace(/\D/g, "").slice(0, 4))} keyboardType="number-pad" autoComplete="postal-code" textContentType="postalCode" />
          <Field testID="lead-notes" label="Anything to check in particular? (optional)" value={notes} onChangeText={setNotes} multiline maxLength={500} />
          <Check testID="lead-consent" checked={agree} onChange={setAgree}>{consentText(partner, true)}</Check>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
            <LinkText title="Our privacy policy ›" onPress={() => open("/privacy")} style={{ fontSize: 14 }} />
            {partner.privacy_url ? <LinkText title={`${partner.name} privacy policy ›`} onPress={() => WebBrowser.openBrowserAsync(partner.privacy_url!)} style={{ fontSize: 14 }} /> : null}
          </View>
          {err ? <Notice kind="bad">{err}</Notice> : null}
          <T v="small">{REFERRER_NOTE.inspection}</T>
        </>
      )}
    </Sheet>
  );
}

/** Listing: estimated repayments (when the server has one) and links to compare loans and insurance. */
export function FinanceBox({ lotId, finance, insurers, buyNow }: { lotId: number; finance: FinanceEstimate | null; insurers: boolean; buyNow: boolean }) {
  return (
    <Soft style={{ gap: 12 }}>
      <T v="strong" style={{ fontSize: 17 }}>Finance & insurance.</T>
      {finance ? (
        <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={s.fig} accessible accessibilityLabel={`Estimated repayments ${money(finance.weekly)} a week`}>
              <T v="small">Est. repayments</T><Text style={s.figV} numberOfLines={1} adjustsFontSizeToFit>{money(finance.weekly)}/wk*</Text>
            </View>
            <View style={s.fig} accessible accessibilityLabel={`Comparison rate ${finance.comparison_rate} percent per annum`}>
              <T v="small">Comparison rate from</T><Text style={s.figV} numberOfLines={1} adjustsFontSizeToFit>{finance.comparison_rate}% p.a.*</Text>
            </View>
          </View>
          <T v="small">*Estimate only, not an offer of credit. {money(finance.amount)} (the all-in price at the {buyNow ? "Buy Now price" : "current bid"}) over {Math.round(finance.months / 12)} years at {finance.rate}% p.a., the lowest advertised rate from the lenders we compare. Comparison rate based on {finance.basis}. {COMPARISON_WARNING}</T>
        </>
      ) : <T v="muted">Work out repayments and compare lenders before you bid.</T>}
      <Button testID="finance-compare" small kind="dark" title="Compare car loans" onPress={() => open(`/finance?lot=${lotId}`)} />
      <View style={s.sep} />
      <T v="muted">Arrange cover before you collect.</T>
      <Button testID="insurance-compare" small kind="white" title={insurers ? "Compare insurance" : "Insurance options"} onPress={() => open(`/insurance?lot=${lotId}`)} />
    </Soft>
  );
}

/** Invoice: insurance before collection (and finance while a balance is owing). */
export function InsureBox({ lotId, balanceOwing }: { lotId: number; balanceOwing: boolean }) {
  return (
    <Soft>
      <T v="h">Insure it before you collect.</T>
      <T v="muted">The vehicle is your responsibility from handover. Compare cover and arrange it before collection day.</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button testID="insurance-compare" small kind="dark" title="Compare insurance" onPress={() => open(`/insurance?lot=${lotId}`)} />
        {balanceOwing ? <Button testID="finance-compare" small kind="white" title="Finance the balance" onPress={() => open(`/finance?lot=${lotId}`)} /> : null}
      </View>
    </Soft>
  );
}

/** The listing's named consultant, for questions about the vehicle, inspections or collection. */
export function ConsultantCard({ consultant, lotId, title }: { consultant: AppConsultant; lotId: number; title: string }) {
  const initials = consultant.name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const phone = consultant.phone?.trim();
  return (
    <Soft>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={s.face} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {consultant.photo_url ? <Image source={{ uri: consultant.photo_url }} style={s.faceImg} contentFit="cover" /> : <Text style={s.initials}>{initials}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <T v="strong" style={{ fontSize: 17 }}>{consultant.name}</T>
          {consultant.title ? <T v="small">{consultant.title}</T> : null}
        </View>
      </View>
      <T v="muted">Questions about this vehicle, inspections or collection? Contact your consultant.</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {phone ? <Button testID="consultant-call" small kind="dark" title={`Call ${phone}`} onPress={() => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, "")}`)} /> : null}
        {consultant.email ? <Button testID="consultant-email" small kind="white" title="Email" onPress={() => Linking.openURL(`mailto:${consultant.email}?subject=${encodeURIComponent(`Lot ${lotId}: ${title}`)}`)} /> : null}
      </View>
    </Soft>
  );
}

const s = StyleSheet.create({
  fig: { flex: 1, backgroundColor: "#FFFFFF", borderRadius: 16, padding: 12, gap: 2 },
  figV: { fontFamily: F.heavy, fontSize: 22, letterSpacing: -0.5, color: C.ink, fontVariant: ["tabular-nums"] },
  link: { fontFamily: F.bold, color: C.blue },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginVertical: 2 },
  face: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.mint, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  faceImg: { width: 56, height: 56 },
  initials: { fontFamily: F.heavy, fontSize: 20, color: C.ink },
});
