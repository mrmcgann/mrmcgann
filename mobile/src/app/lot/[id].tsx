import { useCallback, useEffect, useState } from "react";
import { Dimensions, FlatList, Pressable, Share, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as WebBrowser from "expo-web-browser";
import { gradeInfo } from "@/lib/grades";
import { km } from "@/lib/format";
import { CAT, kindLabel, LICENCES } from "@/lib/vehicles";
import type { Disclosures } from "@/lib/types";
import { api, ApiError, errText, pub } from "~/lib/api";
import { SITE } from "~/lib/env";
import { useSession } from "~/lib/session";
import type { LotBundle, MyLotState } from "~/lib/types";
import { Button, Empty, LinkText, Loading, Screen, Soft, T } from "~/ui/kit";
import { CarArt, Icon } from "~/ui/art";
import { BidPanel } from "~/ui/BidPanel";
import { InspectionBox, QuestionBox, QuoteBox, ReportLink } from "~/ui/LotExtras";
import { LotCard } from "~/ui/LotCard";
import { useWatch } from "~/ui/useWatch";
import { C, F, backdrop } from "~/ui/theme";

const W = Dimensions.get("window").width;
const LETTER = "ABCDE";
const WRITE_OFF: Record<string, string> = { none: "Not recorded as written off", repairable: "Repairable write-off", statutory: "Statutory write-off (can't be re-registered)", unknown: "Being checked" };
const yes = (v: unknown) => (v === true || v === "yes" ? "Yes" : v === false || v === "no" ? "No" : v ? String(v) : null);
const viewed = new Set<number>();

export default function LotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const lotId = Number(id);
  const path = `/lot/${lotId}`;
  const { signedIn } = useSession();
  const { watched, toggle } = useWatch();
  const [b, setB] = useState<LotBundle | null>(null);
  const [mine, setMine] = useState<MyLotState | null>(null);
  const [err, setErr] = useState<{ text: string; missing?: boolean } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [photo, setPhoto] = useState(0);

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
  const g = gradeInfo(lot.visual_grade);
  const d: Disclosures = lot.disclosures || {};
  const facts: [string, unknown][] = [
    ["VIN", lot.vin], ["Registration", lot.rego_plate ? `${lot.rego_plate} (${lot.rego_state || lot.state})` : "Unregistered or not supplied"],
    ["Rego expires", lot.rego_expiry ? new Date(lot.rego_expiry).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : null],
    ["Build date", lot.build_date], ["Compliance date", lot.compliance_date],
    ["Odometer", lot.odometer != null ? `${km(lot.odometer)} (as shown on the dash)` : null],
    ["Engine hours", lot.hours != null ? `${lot.hours.toLocaleString("en-AU")} hours (as shown on the meter)` : null],
    ["GVM", lot.gvm_kg ? `${lot.gvm_kg.toLocaleString("en-AU")} kg` : null],
    ["Licence needed", lot.licence_class ? LICENCES.find((l) => l[0] === lot.licence_class)?.[1] || lot.licence_class : null],
    ["LAMS approved", lot.lams == null ? null : lot.lams ? "Yes, learner approved" : "No"],
    ["Write-off status", WRITE_OFF[lot.write_off_status || "unknown"]],
    ["Stolen check", lot.stolen_clear == null ? null : lot.stolen_clear ? "Not recorded as stolen" : "See note"],
    ["Keys", lot.keys], ["Service books", yes(lot.service_books)],
    ["GST", lot.gst_status === "inc" ? "Price includes GST (business seller)" : "Private sale, no GST on the price"],
  ];
  const specs: [string, unknown][] = [
    ["Year", lot.year], ["Make", lot.make], ["Model", [lot.model, lot.variant].filter(Boolean).join(" ")], ["Type", kindLabel(lot.category, lot.kind) || CAT[lot.category]?.label], ["Body", lot.body],
    ["Engine", [lot.engine, lot.engine_cc ? `${lot.engine_cc.toLocaleString("en-AU")} cc` : null].filter(Boolean).join(" · ")], ["Transmission", lot.transmission], ["Fuel", lot.fuel], ["Drive", lot.drive],
    ["Odometer", lot.odometer != null ? km(lot.odometer) : null], ["Engine hours", lot.hours != null ? `${lot.hours.toLocaleString("en-AU")} hrs` : null], ["Sleeps", lot.berths], ["Length", lot.length_m ? `${lot.length_m} m` : null],
    ["Colour", lot.colour], ["Seats", lot.seats], ["Keys", lot.keys], ["Location", `${lot.suburb}, ${lot.state}`], ["Lot number", lot.id],
  ];
  const declared: [string, unknown][] = [
    ["Accident damage", d.accident], ["Flood damage", d.flood], ["Hail damage", d.hail], ["Modifications", d.modifications],
    ["Warning lights on the dash", d.warning_lights], [lot.odometer == null && lot.hours != null ? "Hour meter concerns" : "Odometer concerns", d.odometer_concerns],
    ["Finance owing", d.finance === "yes" ? "Yes. Paid out from the sale before the seller is paid" : d.finance], ["Known faults", d.known_faults || lot.known_faults],
  ];
  const known: [string, string, boolean][] = [
    ["PPSR search", lot.ppsr_checked_at ? `Searched ${new Date(lot.ppsr_checked_at).toLocaleDateString("en-AU")}. ${lot.ppsr_clear === false ? lot.ppsr_note || "Finance recorded: paid out from the sale" : "No finance or write-off recorded"}` : lot.ppsr_clear == null ? "Pending" : lot.ppsr_clear ? "No finance owing or write-off recorded at listing" : lot.ppsr_note || "See note from Tyrebiter", true],
    ["Seller identity", "ID-verified and ownership papers checked by Tyrebiter", true],
    ["Walkaround photos", "Taken by Tyrebiter at the seller's location", true],
    ...(lot.odometer != null ? [["Odometer", "As shown on the dash. Not independently verified", false] as [string, string, boolean]] : lot.hours != null ? [["Engine hours", "As shown on the meter. Not independently verified", false] as [string, string, boolean]] : []),
    ["Service history", lot.service_history || "As declared by the seller", false],
    ["Roadworthy / safety certificate", lot.roadworthy_note || "Not included unless stated. See your state's rules", false],
  ];
  const cats: [string, string | null, string][] = [["Paint & body", lot.grade_paint, C.tangerine], ["Interior", lot.grade_interior, C.sky], ["Tyres", lot.grade_tyres, C.berry]];
  const show = (rows: [string, unknown][]) => rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  const questionsOpen = ["live", "scheduled", "referred", "offers"].includes(lot.status);

  return (
    <>
      {header}
      <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([load(), loadMine()]); setRefreshing(false); }} contentStyle={{ paddingHorizontal: 0, gap: 22 }} testID="lot-screen">
        <View>
          {photos.length ? (
            <>
              <FlatList data={photos} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(p) => p.id}
                onMomentumScrollEnd={(e) => setPhoto(Math.round(e.nativeEvent.contentOffset.x / W))}
                renderItem={({ item }) => <Image source={{ uri: item.url }} style={{ width: W, height: W * 0.72, backgroundColor: backdrop(lot.backdrop) }} contentFit="cover" accessibilityLabel={item.angle || "Photo"} />} />
              <View style={s.counter}><Text style={s.counterText}>{photo + 1} of {photos.length}</Text></View>
            </>
          ) : (
            <View style={[s.stage, { backgroundColor: backdrop(lot.backdrop) }]}><CarArt type={lot.vehicle_type} width={W * 0.78} /><Text style={s.ph}>Photos coming soon</Text></View>
          )}
        </View>
        <View style={s.pad}>
          <T v="eyebrow" style={{ color: C.urgent }}>At the seller's location in {lot.suburb}, {lot.state}</T>
          <T v="d2">{lot.short_title || lot.title}.</T>
          {lot.subtitle ? <T v="muted" style={{ fontSize: 17, lineHeight: 24 }}>{lot.subtitle}</T> : null}
          <T v="small">{watchers} watching · {(lot.views || 0).toLocaleString("en-AU")} views · Lot {lot.id}</T>
          {lot.video_url ? <Button small kind="soft" title="Watch the walkaround video" onPress={() => WebBrowser.openBrowserAsync(lot.video_url!)} style={{ alignSelf: "flex-start" }} /> : null}
        </View>

        <View style={s.pad}>
          <BidPanel lot={lot} fees={fees} mine={mine} history={history} onStatusChange={() => { void load(); void loadMine(); }} onMineChange={loadMine} />
        </View>

        {lot.status === "live" ? <View style={s.pad}><InspectionBox lotId={lot.id} suburb={lot.suburb || ""} state={lot.state || ""} endsAt={lot.ends_at} mine={mine} path={path} /></View> : null}

        {lot.take ? <View style={s.pad}><T v="eyebrow" style={{ color: C.grape }}>Tyrebiter's take</T><Text style={s.take}>{lot.take}</Text></View> : null}
        {lot.owner_note ? <View style={s.pad}><Soft><T v="small" style={{ fontFamily: F.bold }}>From the owner</T><T v="body" style={{ fontSize: 17, lineHeight: 25 }}>“{lot.owner_note}”</T></Soft></View> : null}

        <View style={s.pad}>
          <T v="d3">The facts.</T>
          <View style={s.facts}>
            {show(facts).map(([k, v]) => <View key={k} style={s.fact}><T v="small">{k}</T><T v="strong" selectable>{String(v)}</T></View>)}
          </View>
          <T v="small">VIN, registration and PPSR details are checked by Tyrebiter before listing. Run your own history check with the VIN if you like.</T>
        </View>

        <View style={s.pad}>
          <T v="d3">Condition report.</T>
          <Soft><T v="body" style={{ fontSize: 15, lineHeight: 22 }}><Text style={{ fontFamily: F.bold }}>A guide only. </Text>Based on a visual walkaround at the seller's location and what the seller told us. It isn't a mechanical or roadworthy inspection and may not show every fault. Inspect before you bid. If the vehicle is materially different from this listing, you can make a claim.</T></Soft>
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
            </View>
          ) : null}
          {flaws.length ? (
            <View style={{ gap: 12 }}>
              <T v="h">Every flaw we spotted, photographed.</T>
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
          <T v="d3">Specs.</T>
          <View>{show(specs).map(([k, v]) => <View key={k} style={s.spec}><T v="muted">{k}</T><T v="strong" style={{ flexShrink: 1, textAlign: "right" }}>{String(v)}</T></View>)}</View>
        </View>

        <View style={s.pad}>
          <T v="d3">What we know.</T>
          {known.map(([k, v, ours]) => (
            <View key={k} style={{ flexDirection: "row", gap: 12, paddingVertical: 6 }}>
              <View style={[s.tick, { backgroundColor: ours ? C.mint : C.sun }]}>{ours ? <Icon name="check" size={14} strokeWidth={3.2} /> : <Text style={{ fontFamily: F.heavy, fontSize: 13 }}>i</Text>}</View>
              <View style={{ flex: 1 }}><T v="strong">{k}</T><T v="small">{v}</T></View>
            </View>
          ))}
          <T v="small">Green: checked by Tyrebiter. Yellow: declared by the seller.</T>
        </View>

        {show(declared).length ? (
          <View style={s.pad}>
            <T v="d3">What the seller declared.</T>
            <T v="muted">The seller answered these questions in writing when they signed their agreement with us. They're legally responsible for their answers.</T>
            <View>{show(declared).map(([k, v]) => <View key={k} style={s.spec}><T v="muted">{k}</T><T v="strong" style={{ flexShrink: 1, textAlign: "right" }}>{String(v)}</T></View>)}</View>
          </View>
        ) : null}

        <View style={s.pad}>
          <T v="d3">Questions.</T>
          {questions.length === 0 ? <T v="muted">No public questions yet.</T> : questions.map((q, i) => (
            <Soft key={i}><T v="strong">{q.question}</T><T v="body">{q.answer}</T></Soft>
          ))}
          <QuestionBox lotId={lot.id} mine={mine} open={questionsOpen} path={path} />
        </View>

        {["live", "sold"].includes(lot.status) ? <View style={s.pad}><QuoteBox lotId={lot.id} /></View> : null}
        <View style={s.pad}>
          <Soft><T v="strong">Collection.</T><T v="muted">From the seller's location within 5 business days of paying in full. Book a time from your invoice. The seller only hands over the keys to someone with your release code.</T></Soft>
          <Soft><T v="strong">Buying safely.</T><T v="muted">Pay Tyrebiter only, never the seller. We never change our bank details by email or SMS.</T><ReportLink lotId={lot.id} path={path} /></Soft>
          <LinkText title="How claims and collection work ›" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms#t-claims`)} />
        </View>

        {similar.length ? (
          <View style={[s.pad, { gap: 20 }]}>
            <T v="d3">You might also like.</T>
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
  stage: { height: W * 0.72, alignItems: "center", justifyContent: "flex-end", paddingBottom: 44 },
  ph: { position: "absolute", bottom: 14, fontFamily: F.bold, fontSize: 13, color: "rgba(29,29,31,0.6)" },
  counter: { position: "absolute", right: 14, bottom: 14, backgroundColor: "rgba(29,29,31,0.7)", borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  counterText: { color: "#FFFFFF", fontFamily: F.bold, fontSize: 12 },
  take: { fontFamily: F.semibold, fontSize: 21, lineHeight: 30, letterSpacing: -0.3, color: C.ink },
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
