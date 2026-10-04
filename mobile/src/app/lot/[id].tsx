import { useCallback, useEffect, useState } from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { gradeInfo } from "@/lib/grades";
import { km } from "@/lib/format";
import { CAT, kindLabel, LICENCES } from "@/lib/vehicles";
import type { Disclosures, Lot } from "@/lib/types";
import { api, ApiError, errText, pub } from "~/lib/api";
import { SITE } from "~/lib/env";
import { useSession } from "~/lib/session";
import type { LotBundle, MyLotState } from "~/lib/types";
import { Button, Empty, LinkText, Loading, Screen, Soft, T } from "~/ui/kit";
import { Icon } from "~/ui/art";
import { BidPanel } from "~/ui/BidPanel";
import { Gallery } from "~/ui/Gallery";
import { QuestionBox, QuoteBox, ReportLink } from "~/ui/LotExtras";
import { ConsultantCard, FinanceBox, MobileInspection } from "~/ui/Partners";
import { LotCard } from "~/ui/LotCard";
import { useWatch } from "~/ui/useWatch";
import { C, F } from "~/ui/theme";

const LETTER = "ABCDE";
const WRITE_OFF: Record<string, string> = { none: "Not recorded as written off", repairable: "Repairable write-off", statutory: "Statutory write-off (can't be re-registered)", unknown: "Being checked" };
const yes = (v: unknown) => (v === true || v === "yes" ? "Yes" : v === false || v === "no" ? "No" : v ? String(v) : null);
const viewed = new Set<number>();

// Registered (plate, state, expiry) or unregistered (sold without plates): the website's regoFacts and regoTag.
const shortDate = (s: string) => new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
function regoFacts(lot: Lot): [string, unknown][] {
  if (lot.registration === "unregistered") {
    return [["Registration", "Unregistered, sold without plates"], ["Previous registration", lot.rego_plate ? `${lot.rego_plate} (${lot.rego_state || lot.state})` : null]];
  }
  if (lot.registration === "registered" || lot.rego_plate) {
    return [["Registration", `Registered${lot.rego_plate ? ` · ${lot.rego_plate}` : ""} (${lot.rego_state || lot.state})`], ["Registration expiry", lot.rego_expiry ? shortDate(lot.rego_expiry) : null]];
  }
  return [["Registration", "Not supplied"]];
}
const regoTag = (lot: Lot) => (lot.registration === "unregistered" ? "Unregistered" : lot.registration === "registered" ? `Registered ${lot.rego_state || lot.state || ""}`.trim() : null);

export default function LotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lotId = Number(id);
  const path = `/lot/${lotId}`;
  const { signedIn, config } = useSession();
  const { watched, toggle } = useWatch();
  const [b, setB] = useState<LotBundle | null>(null);
  const [mine, setMine] = useState<MyLotState | null>(null);
  const [err, setErr] = useState<{ text: string; missing?: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setB(await pub<LotBundle>(`/api/lots/${lotId}`)); setErr(null); }
    catch (e) { setErr({ text: errText(e), missing: e instanceof ApiError && e.status === 404 }); }
  }, [lotId]);
  const loadMine = useCallback(async () => {
    if (!signedIn) { setMine(null); return; }
    try { setMine((await api<{ state: MyLotState | null }>(`/api/lots/${lotId}/me`)).state); } catch { /* shown without personal state */ }
  }, [lotId, signedIn]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadMine(); }, [loadMine]);
  useEffect(() => { if (!viewed.has(lotId)) { viewed.add(lotId); api(`/api/lots/${lotId}/view`, { method: "POST", auth: false }).catch(() => undefined); } }, [lotId]);

  const header = (
    <Stack.Screen options={{
      title: b ? `Lot ${lotId}` : "",
      headerRight: () => (
        <View style={{ flexDirection: "row", gap: 4 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Share" hitSlop={8} style={s.hbtn} onPress={() => Share.share({ message: `${b?.lot.title || "Tyrebiter"} ${SITE}/lot/${lotId}`, url: `${SITE}/lot/${lotId}` })}><Icon name="share" size={21} /></Pressable>
          <Pressable testID="lot-watch" accessibilityRole="button" accessibilityLabel={watched.has(lotId) ? "Remove from watchlist" : "Add to watchlist"} hitSlop={8} style={s.hbtn} onPress={() => toggle(lotId)}><Icon name={watched.has(lotId) || mine?.watched ? "heartOn" : "heart"} size={22} /></Pressable>
        </View>
      ),
    }} />
  );
  if (err && !b) return <>{header}<Screen><Empty title={err.missing ? "This vehicle isn't available." : "Can't load this vehicle."} sub={err.missing ? "It may have been withdrawn or archived." : err.text}><Button title={err.missing ? "Browse live auctions" : "Try again"} onPress={err.missing ? () => router.replace("/search") : load} /></Empty></Screen></>;
  if (!b) return <>{header}<Loading /></>;

  const { lot, photos, flaws, questions, watchers, similar, history, fees } = b;
  // Fields added to the bundle later; an older cached response may not have them yet.
  const videos = b.videos || [], consultant = b.consultant || null, finance = b.finance || null, inspector = b.inspector || null;
  const g = gradeInfo(lot.visual_grade);
  const d: Disclosures = lot.disclosures || {};
  const facts: [string, unknown][] = [
    ["VIN", lot.vin], ...regoFacts(lot),
    ["Build date", lot.build_date], ["Compliance date", lot.compliance_date],
    ["Indicated odometer", lot.odometer != null ? km(lot.odometer) : null],
    ["Indicated hours", lot.hours != null ? `${lot.hours.toLocaleString("en-AU")} hours` : null],
    ["GVM", lot.gvm_kg ? `${lot.gvm_kg.toLocaleString("en-AU")} kg` : null],
    ["Licence class", lot.licence_class ? LICENCES.find((l) => l[0] === lot.licence_class)?.[1] || lot.licence_class : null],
    ["LAMS approved", lot.lams == null ? null : lot.lams ? "Yes" : "No"],
    ["Write-off status", WRITE_OFF[lot.write_off_status || "unknown"]],
    ["Stolen check", lot.stolen_clear == null ? null : lot.stolen_clear ? "Not recorded as stolen" : "See note"],
    ["Keys", lot.keys], ["Service books", yes(lot.service_books)],
    ["GST", lot.gst_status === "inc" ? "Price includes GST" : "No GST on the hammer price (private sale)"],
  ];
  const specs: [string, unknown][] = [
    ["Year", lot.year], ["Make", lot.make], ["Model", [lot.model, lot.variant].filter(Boolean).join(" ")], ["Type", kindLabel(lot.category, lot.kind) || CAT[lot.category]?.label], ["Body", lot.body],
    ["Engine", [lot.engine, lot.engine_cc ? `${lot.engine_cc.toLocaleString("en-AU")} cc` : null].filter(Boolean).join(" · ")], ["Transmission", lot.transmission], ["Fuel", lot.fuel], ["Drive", lot.drive],
    ["Odometer", lot.odometer != null ? km(lot.odometer) : null], ["Hours", lot.hours != null ? `${lot.hours.toLocaleString("en-AU")} hrs` : null], ["Sleeps", lot.berths], ["Length", lot.length_m ? `${lot.length_m} m` : null],
    ["Exterior colour", lot.colour], ["Seats", lot.seats], ["Keys", lot.keys], ["Location", `${lot.suburb}, ${lot.state}`], ["Lot", lot.id],
  ];
  const declared: [string, unknown][] = [
    ["Accident damage", d.accident], ["Flood damage", d.flood], ["Hail damage", d.hail], ["Modifications", d.modifications],
    ["Warning lights", d.warning_lights], [lot.odometer == null && lot.hours != null ? "Hour meter concerns" : "Odometer concerns", d.odometer_concerns],
    ["Finance owing", d.finance === "yes" ? "Yes. Paid out from the sale proceeds" : d.finance], ["Known faults", d.known_faults || lot.known_faults],
  ];
  const known: [string, string, boolean][] = [
    ["PPSR search", lot.ppsr_checked_at ? `Searched ${new Date(lot.ppsr_checked_at).toLocaleDateString("en-AU")}${lot.ppsr_cert_no ? `, certificate ${lot.ppsr_cert_no}` : ""}. ${lot.ppsr_clear === false ? lot.ppsr_note || "Finance recorded: paid out from the sale proceeds" : "No finance or write-off recorded"}` : lot.ppsr_clear == null ? "Pending" : lot.ppsr_clear ? "No finance owing or write-off recorded at listing" : lot.ppsr_note || "See note", true],
    ["Seller identity", "ID and proof of ownership verified", true],
    ["Photographs", "Taken by Tyrebiter at the vehicle's location", true],
    ...(lot.odometer != null ? [["Odometer", "As indicated. Not independently verified", false] as [string, string, boolean]] : lot.hours != null ? [["Hours", "As indicated. Not independently verified", false] as [string, string, boolean]] : []),
    ["Service history", lot.service_history || "As declared by the seller", false],
    ["Roadworthy / safety certificate", lot.roadworthy_note || "Not supplied unless stated. See your state's rules", false],
  ];
  const cats: [string, string | null, string][] = [["Paint & body", lot.grade_paint, C.tangerine], ["Interior", lot.grade_interior, C.sky], ["Tyres", lot.grade_tyres, C.berry]];
  const show = (rows: [string, unknown][]) => rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  const questionsOpen = ["live", "scheduled", "referred", "offers"].includes(lot.status);
  const forSale = ["live", "scheduled"].includes(lot.status);
  const tag = regoTag(lot);
  const unreg = lot.registration === "unregistered";

  return (
    <>
      {header}
      <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([load(), loadMine()]); setRefreshing(false); }} contentStyle={{ paddingHorizontal: 0, gap: 22 }} testID="lot-screen">
        <Gallery photos={photos} videos={videos} externalVideo={lot.video_url} backdropKey={lot.backdrop} vehicleType={lot.vehicle_type} title={lot.title} />
        <View style={s.pad}>
          <T v="eyebrow" style={{ color: C.urgent }}>Lot {lot.id} · {lot.suburb}, {lot.state}{tag ? ` · ${tag}` : ""}</T>
          <T v="d2">{lot.short_title || lot.title}.</T>
          {lot.subtitle ? <T v="muted" style={{ fontSize: 17, lineHeight: 24 }}>{lot.subtitle}</T> : null}
          <T v="small">{watchers} watching · {(lot.views || 0).toLocaleString("en-AU")} {lot.views === 1 ? "view" : "views"}</T>
        </View>

        <View style={s.pad}>
          <BidPanel lot={lot} fees={fees} mine={mine} history={history} onStatusChange={() => { void load(); void loadMine(); }} onMineChange={loadMine} />
          {["live", "scheduled", "offers", "referred"].includes(lot.status) ? <FinanceBox lotId={lot.id} finance={finance} insurers={!!b.insurers} buyNow={!!lot.buy_now_price} /> : null}
          {consultant ? <ConsultantCard consultant={consultant} lotId={lot.id} title={lot.title} /> : null}
        </View>

        {lot.take || lot.owner_note ? (
          <View style={s.pad}>
            <T v="d3">Overview.</T>
            {lot.take ? <Text style={s.take}>{lot.take}</Text> : null}
            {lot.owner_note ? <Soft><T v="small" style={{ fontFamily: F.bold }}>Seller's comments</T><T v="body" style={{ fontSize: 17, lineHeight: 25 }}>“{lot.owner_note}”</T></Soft> : null}
          </View>
        ) : null}

        <View style={s.pad}>
          <T v="d3">Vehicle details.</T>
          <View style={s.facts}>
            {show(facts).map(([k, v]) => <View key={k} style={s.fact}><T v="small">{k}</T><T v="strong" selectable>{String(v)}</T></View>)}
          </View>
          <T v="small">VIN, registration and PPSR are checked by Tyrebiter before listing. Odometer and hours are as indicated, not independently verified. Registration rules differ by state: <Text style={s.link} accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms#t-states`)}>rego and plates ›</Text></T>
        </View>

        <View style={s.pad}>
          <T v="d3">Condition report.</T>
          <Soft><T v="body" style={{ fontSize: 15, lineHeight: 22 }}><Text style={{ fontFamily: F.bold }}>A guide only. </Text>Prepared from a visual inspection at the vehicle's location and the seller's written declarations. It isn't a mechanical or roadworthy inspection and may not show every fault. We recommend an independent mobile inspection before you bid. If the vehicle is materially different from this listing (wrong year, VIN or transmission, an undisclosed write-off or finance, or major damage not shown), you can make a claim. <Text style={s.link} accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms#t-claims`)}>Claims ›</Text></T></Soft>
          {lot.visual_grade ? (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                <View style={s.orb}><Text style={s.orbK}>Visual grade</Text><Text style={s.orbV}>{lot.visual_grade}</Text><Text style={s.orbK}>{g[1]}</Text></View>
                <T v="body" style={{ flex: 1, fontSize: 15, lineHeight: 21 }}><Text style={{ fontFamily: F.bold }}>{g[0]} · {g[1]}. </Text>{g[2]}</T>
              </View>
              {cats.map(([label, grade, colour]) => grade ? (
                <View key={label} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <T v="body" style={{ width: 104, fontSize: 14 }}>{label}</T>
                  <View style={s.track}><View style={[s.fill, { width: `${(5 - LETTER.indexOf(grade)) * 20}%`, backgroundColor: colour }]} /></View>
                  <T v="strong" style={{ width: 18, textAlign: "right" }}>{grade}</T>
                </View>
              ) : null)}
              {lot.tyre_tread ? <T v="small">Tyre tread: {lot.tyre_tread}</T> : null}
              <T v="small">Graded on visible condition only. Mechanical condition isn't graded.</T>
            </View>
          ) : null}
          {flaws.length ? (
            <View style={{ gap: 12 }}>
              <T v="h">Damage and wear.</T>
              {flaws.map((fl) => (
                <View key={fl.id} style={{ flexDirection: "row", gap: 12 }}>
                  {fl.url ? <Image source={{ uri: fl.url }} style={s.flawImg} contentFit="cover" /> : <View style={[s.flawImg, { backgroundColor: C.panel }]} />}
                  <View style={{ flex: 1, gap: 2 }}><T v="strong">{fl.title}</T>{fl.note ? <T v="muted">{fl.note}</T> : null}</View>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={s.pad}>
          <T v="d3">Specifications.</T>
          <View>{show(specs).map(([k, v]) => <View key={k} style={s.spec}><T v="muted">{k}</T><T v="strong" style={{ flexShrink: 1, textAlign: "right" }}>{String(v)}</T></View>)}</View>
        </View>

        <View style={s.pad}>
          <T v="d3">Checks.</T>
          {known.map(([k, v, ours]) => (
            <View key={k} style={{ flexDirection: "row", gap: 12, paddingVertical: 6 }}>
              <View style={[s.tick, { backgroundColor: ours ? C.mint : C.sun }]}>{ours ? <Icon name="check" size={14} strokeWidth={3.2} /> : <Text style={{ fontFamily: F.heavy, fontSize: 13 }}>i</Text>}</View>
              <View style={{ flex: 1 }}><T v="strong">{k}</T><T v="small">{v}</T></View>
            </View>
          ))}
          <T v="small">Green: verified by Tyrebiter. Yellow: declared by the seller.</T>
        </View>

        {show(declared).length ? (
          <View style={s.pad}>
            <T v="d3">Seller declarations.</T>
            <T v="muted">Made in writing by the seller, who is responsible for their accuracy.</T>
            <View>{show(declared).map(([k, v]) => <View key={k} style={s.spec}><T v="muted">{k}</T><T v="strong" style={{ flexShrink: 1, textAlign: "right" }}>{String(v)}</T></View>)}</View>
          </View>
        ) : null}

        <View style={s.pad}>
          <T v="d3">Inspection & collection.</T>
          <View>
            {([
              ["Inspection", "Independent mobile inspection, or through your consultant"],
              ["Before collection", unreg ? "Payment in full, then the certificate of sale in your name" : "Payment in full, then the registration transferred to you"],
              ["Collection", `${lot.suburb}, ${lot.state}${unreg ? ". By carrier, trailer or permit" : ""}`],
              ["Address", "Sent once ownership is transferred and your collection time is confirmed"],
            ] as [string, string][]).map(([k, v]) => (
              <View key={k} style={s.spec}><T v="muted">{k}</T><T v="strong" style={{ flexShrink: 1, textAlign: "right" }}>{v}</T></View>
            ))}
          </View>
          <MobileInspection lotId={lot.id} title={lot.title} partner={inspector} consultantPhone={consultant?.phone || config?.phone || null} consultantName={consultant?.name || null} canOrder={forSale} />
          {["live", "sold"].includes(lot.status) ? <QuoteBox lotId={lot.id} /> : null}
        </View>

        <View style={s.pad}>
          <T v="d3">Questions.</T>
          {questions.length === 0 ? <T v="muted">No public questions yet.</T> : questions.map((q, i) => (
            <Soft key={i}><T v="strong">{q.question}</T><T v="body">{q.answer}</T></Soft>
          ))}
          <QuestionBox lotId={lot.id} mine={mine} open={questionsOpen} path={path} />
        </View>

        <View style={s.pad}>
          <Soft><T v="strong">Buying safely.</T><T v="muted">Pay Tyrebiter only, never the seller. Our bank details never change by email or SMS.{config?.phone ? ` If anything looks wrong, call ${config.phone}.` : ""}</T><ReportLink lotId={lot.id} path={path} /></Soft>
          <LinkText title="How claims and collection work ›" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms#t-claims`)} />
        </View>

        {similar.length ? (
          <View style={[s.pad, { gap: 20 }]}>
            <T v="d3">Similar vehicles.</T>
            {similar.map((l) => <LotCard key={l.id} lot={l} watched={watched.has(l.id)} onWatch={toggle} compact />)}
          </View>
        ) : null}
      </Screen>
    </>
  );
}

const s = StyleSheet.create({
  pad: { paddingHorizontal: 20, gap: 12 },
  hbtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  take: { fontFamily: F.medium, fontSize: 19, lineHeight: 28, letterSpacing: -0.2, color: C.ink },
  link: { fontFamily: F.bold, color: C.blue },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fact: { width: "48.8%", backgroundColor: C.panel, borderRadius: 16, padding: 12, gap: 2 },
  orb: { width: 96, height: 96, borderRadius: 48, backgroundColor: C.sun, alignItems: "center", justifyContent: "center" },
  orbK: { fontFamily: F.bold, fontSize: 10, color: C.ink },
  orbV: { fontFamily: F.heavy, fontSize: 34, lineHeight: 38, color: C.ink },
  track: { flex: 1, height: 10, borderRadius: 5, backgroundColor: C.panel2, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 5 },
  flawImg: { width: 96, height: 72, borderRadius: 12 },
  spec: { flexDirection: "row", justifyContent: "space-between", gap: 16, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  tick: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", marginTop: 1 },
});
