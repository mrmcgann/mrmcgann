import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CATEGORIES } from "@/lib/vehicles";
import { money } from "@/lib/format";
import { pub } from "~/lib/api";
import { useSession } from "~/lib/session";
import type { HomeData } from "~/lib/types";
import { Button, Empty, Loading, Screen, T, Notice } from "~/ui/kit";
import { CarArt, Icon, LogoMark } from "~/ui/art";
import { LotCard, shownPrice } from "~/ui/LotCard";
import { useWatch } from "~/ui/useWatch";
import { C, F, backdrop, darkBackdrop } from "~/ui/theme";

const TRY: [string, string][] = [["HiLux under 30k", "make=Toyota&model=HiLux&cat=utes&max=30000"], ["LAMS bikes", "cat=motorbikes&lams=1"], ["Caravan sleeps 4", "cat=caravans&berths=4"], ["Tipper on a car licence", "cat=trucks&type=tipper&lic=C"], ["First car under $5k", "cat=cars&max=5000"], ["Ending today", "ending=today"]];

export default function Home() {
  const insets = useSafeAreaInsets();
  const { signedIn, me, config } = useSession();
  const { watched, toggle } = useWatch();
  const [data, setData] = useState<HomeData | null>(null);
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try { setData(await pub<HomeData>("/api/home")); setErr(""); } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const unread = me?.profile?.unread || 0;
  const f = data?.featured;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      <View style={s.top}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><LogoMark size={26} /><Text style={s.word}>tyrebiter</Text></View>
        {signedIn ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Notifications${unread ? `, ${unread} unread` : ""}`} onPress={() => router.push("/notifications")} style={s.iconBtn} hitSlop={6}>
            <Icon name="bell" />
            {unread ? <View style={s.dot}><Text style={s.dotText}>{unread > 9 ? "9+" : unread}</Text></View> : null}
          </Pressable>
        ) : <Button small kind="soft" title="Sign in" onPress={() => router.push("/signin")} />}
      </View>
      <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} contentStyle={{ paddingTop: 8, gap: 26 }} testID="home">
        {config?.notice ? <Notice>{config.notice}</Notice> : null}
        <View style={{ gap: 12 }}>
          <T v="eyebrow" style={{ color: C.urgent }}>Live auctions · Australia-wide</T>
          <Text style={s.hero}>Every car.{"\n"}Beautifully <Text style={s.heroSerif}>sold.</Text></Text>
          <T v="muted">Online auctions for cars, utes, trucks, motorbikes, caravans, boats and machinery across Australia. Professionally photographed, PPSR searched and sold to the highest bidder.</T>
        </View>
        <Pressable testID="home-search" accessibilityRole="search" accessibilityLabel="Search vehicles" onPress={() => router.push("/search?focus=1")} style={s.search}>
          <Icon name="search" color={C.muted} />
          <Text style={s.searchText} numberOfLines={1}>Try “HiLux under 30k in QLD”</Text>
        </Pressable>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ marginHorizontal: -20 }}>
          <View style={{ width: 12 }} />
          {TRY.map(([l, q]) => (
            <Pressable key={q} accessibilityRole="button" onPress={() => router.push(`/search?${q}`)} style={s.try}><Text style={s.tryText}>{l}</Text></Pressable>
          ))}
          <View style={{ width: 12 }} />
        </ScrollView>

        <View style={{ gap: 12 }}>
          <T v="h">Browse.</T>
          <View style={s.grid}>
            {CATEGORIES.map((c) => (
              <Pressable key={c.key} testID={`cat-${c.key}`} accessibilityRole="button" accessibilityLabel={`${c.label}, ${data?.cats?.[c.key] || 0} live`} onPress={() => router.push(`/search?cat=${c.key}`)} style={[s.tile, { backgroundColor: backdrop(c.backdrop) }]}>
                <View style={{ alignItems: "center", marginTop: 6 }}><CarArt type={c.silhouette} width={118} /></View>
                <Text style={[s.tileText, darkBackdrop(c.backdrop) && { color: "#FFFFFF" }]} numberOfLines={1}>{c.short}</Text>
                <Text style={[s.tileCount, darkBackdrop(c.backdrop) && { color: "rgba(255,255,255,0.8)" }]}>{data ? `${(data.cats[c.key] || 0).toLocaleString("en-AU")} live` : " "}</Text>
              </Pressable>
            ))}
            <Pressable accessibilityRole="button" onPress={() => router.push("/search?cat=cheap")} style={[s.tile, { backgroundColor: C.berry, justifyContent: "center" }]}>
              <Text style={[s.tileText, { fontSize: 26, lineHeight: 28 }]}>Under{"\n"}$5,000</Text>
              <Text style={s.tileCount}>{data ? `${data.cheap.toLocaleString("en-AU")} live` : " "}</Text>
            </Pressable>
          </View>
        </View>

        {err && !data ? <Empty title="Can't reach Tyrebiter." sub={err}><Button title="Try again" onPress={load} /></Empty> : null}
        {!data && !err ? <Loading /> : null}

        {f ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Lot of the week: ${f.title}`} onPress={() => router.push(`/lot/${f.id}`)} style={[s.feature, { backgroundColor: backdrop(f.backdrop) }]}>
            <Text style={s.featureTag}>Lot of the week</Text>
            <Text style={[s.featureTitle, darkBackdrop(f.backdrop) && { color: "#FFFFFF" }]}>{f.title}</Text>
            <View style={{ alignItems: "center" }}><CarArt type={f.vehicle_type} width={260} /></View>
            <Text style={[s.featurePrice, darkBackdrop(f.backdrop) && { color: "#FFFFFF" }]}>{money(shownPrice(f))} · {f.suburb}, {f.state}</Text>
          </Pressable>
        ) : null}

        {data?.ending.length ? (
          <View style={{ gap: 18 }}>
            <View style={s.head}><T v="d3">Ending soonest.</T><Text style={s.more} onPress={() => router.push("/search")}>See all ›</Text></View>
            {data.ending.map((l) => <LotCard key={l.id} lot={l} watched={watched.has(l.id)} onWatch={toggle} />)}
          </View>
        ) : data ? <Empty title="No live auctions right now." sub="New vehicles are listed every week. Save a search and we'll tell you first." /> : null}

        {data?.fresh.length ? (
          <View style={{ gap: 18 }}>
            <T v="d3">Just listed.</T>
            {data.fresh.map((l) => <LotCard key={`n${l.id}`} lot={l} watched={watched.has(l.id)} onWatch={toggle} compact />)}
          </View>
        ) : null}

        <View style={s.sell}>
          <T v="eyebrow" style={{ color: C.sun }}>Sell with Tyrebiter</T>
          <Text style={s.sellTitle}>Sold properly. <Text style={{ fontFamily: F.serif, color: C.sun }}>From your driveway.</Text></Text>
          <Text style={s.sellBody}>We photograph and inspect it at your place, list it Australia-wide and handle every enquiry. You're paid once the buyer has paid and collected.</Text>
          <Button testID="home-sell" kind="white" title="Sell your vehicle" onPress={() => router.push("/appraisal")} />
        </View>
      </Screen>
    </View>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, height: 54 },
  word: { fontFamily: F.heavy, fontSize: 22, letterSpacing: -0.8, color: C.ink },
  iconBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  dot: { position: "absolute", top: 4, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.berry, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  dotText: { color: "#FFFFFF", fontFamily: F.heavy, fontSize: 10 },
  hero: { fontFamily: F.heavy, fontSize: 44, lineHeight: 44, letterSpacing: -2.2, color: C.ink },
  heroSerif: { fontFamily: F.serif, color: C.blue, letterSpacing: -1 },
  search: { height: 58, borderRadius: 29, backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, borderWidth: 1, borderColor: C.line, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 4 },
  searchText: { fontFamily: F.medium, fontSize: 16, color: C.muted, flex: 1 },
  try: { height: 36, borderRadius: 18, paddingHorizontal: 14, backgroundColor: C.panel, justifyContent: "center" },
  tryText: { fontFamily: F.semibold, fontSize: 14, color: C.ink },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "48.5%", height: 128, borderRadius: 22, padding: 14, justifyContent: "flex-end", overflow: "hidden" },
  tileText: { fontFamily: F.heavy, fontSize: 17, color: C.ink, letterSpacing: -0.3 },
  tileCount: { fontFamily: F.semibold, fontSize: 12, color: "rgba(29,29,31,0.7)" },
  feature: { borderRadius: 28, padding: 22, gap: 10 },
  featureTag: { alignSelf: "flex-start", backgroundColor: C.ink, color: "#FFFFFF", fontFamily: F.heavy, fontSize: 12, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14, overflow: "hidden" },
  featureTitle: { fontFamily: F.heavy, fontSize: 26, lineHeight: 29, letterSpacing: -0.8, color: C.ink },
  featurePrice: { fontFamily: F.bold, fontSize: 16, color: C.ink },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
  more: { fontFamily: F.bold, fontSize: 16, color: C.blue },
  sell: { backgroundColor: C.ink, borderRadius: 28, padding: 24, gap: 12 },
  sellTitle: { fontFamily: F.heavy, fontSize: 32, lineHeight: 34, letterSpacing: -1.2, color: "#FFFFFF" },
  sellBody: { fontFamily: F.medium, fontSize: 16, lineHeight: 23, color: "rgba(255,255,255,0.85)" },
});
