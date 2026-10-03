import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CATEGORIES, CAT } from "@/lib/vehicles";
import { SORTS, cleanFilters, describe, describeParts, heading, parseQuery, suggest, toQueryString, type Facets, type FilterKey, type SearchFilters, type Suggestion } from "@/lib/search";
import { api, errText, pub } from "~/lib/api";
import { useSession } from "~/lib/session";
import { askForPush } from "~/lib/push";
import { getPref, setPref } from "~/lib/storage";
import type { SearchResult } from "~/lib/types";
import { Button, Empty, Loading, Pill, Segmented, Select, T } from "~/ui/kit";
import { Icon } from "~/ui/art";
import { LotCard } from "~/ui/LotCard";
import { CAT_KEYS, FilterSheet } from "~/ui/FilterSheet";
import { useWatch } from "~/ui/useWatch";
import { C, F } from "~/ui/theme";

type Recent = { label: string; f: SearchFilters };
const CHIP_REMOVES: Partial<Record<FilterKey, FilterKey[]>> = { make: ["make", "model"], cat: ["cat", ...(CAT_KEYS as FilterKey[])], ymin: ["ymin", "ymax"], min: ["min", "max"], ccmin: ["ccmin", "ccmax"], lenmin: ["lenmin", "lenmax"] };
const ICON: Record<Suggestion["kind"], string> = { smart: "↵", model: "●", make: "●", category: "▦", type: "▦", state: "⌖", lot: "#", keyword: "⌕" };

/** Filters from a link (?cat=utes&q=hilux+under+30k): plain-English keywords understood, explicit filters win. */
function fromParams(p: Record<string, string | string[] | undefined>): SearchFilters {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) if (typeof v === "string" && k !== "focus") flat[k] = v;
  const raw = cleanFilters(flat);
  if (!raw.q) return raw;
  const parsed = parseQuery(raw.q).f;
  const { q: _q, ...explicit } = raw;
  return cleanFilters({ ...parsed, ...explicit, q: parsed.q });
}

function chipsFor(f: SearchFilters): [FilterKey, string][] {
  const out: [FilterKey, string][] = [];
  const order: FilterKey[] = ["make", "cat", "ymin", "min", "km", "hrs", "ccmin", "lams", "lic", "berths", "lenmin", "fuel", "trans", "drive", "state", "seller", "nores", "buynow", "ending", "grade", "q"];
  const single = (k: FilterKey) => describeParts({ [k]: f[k], ...(k === "ymin" ? { ymax: f.ymax } : {}), ...(k === "min" ? { max: f.max } : {}), ...(k === "make" ? { model: f.model } : {}), ...(k === "cat" ? { type: f.type } : {}), ...(k === "ccmin" ? { ccmax: f.ccmax } : {}), ...(k === "lenmin" ? { lenmax: f.lenmax } : {}) }).join("");
  for (const k of order) {
    const on = k === "ymin" ? f.ymin || f.ymax : k === "min" ? f.min || f.max : k === "ccmin" ? f.ccmin || f.ccmax : k === "lenmin" ? f.lenmin || f.lenmax : f[k];
    if (on && !(k === "cat" && f.make && f.model && !f.type)) out.push([k === "ymin" && !f.ymin ? "ymax" : k === "min" && !f.min ? "max" : k, single(k)]);
  }
  return out;
}

export default function Search() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<Record<string, string>>();
  const paramKey = JSON.stringify(params);
  const { signedIn } = useSession();
  const { watched, toggle } = useWatch();
  const [f, setF] = useState<SearchFilters>(() => fromParams(params));
  const [text, setText] = useState(f.q || "");
  const [focused, setFocused] = useState(false);
  const [allFacets, setAllFacets] = useState<Facets | null>(null);
  const [res, setRes] = useState<SearchResult | null>(null);
  const [more, setMore] = useState(false);
  const [err, setErr] = useState("");
  const [sheet, setSheet] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const input = useRef<TextInput>(null);
  const key = toQueryString(f);

  // A new link (home screen category, try-row, alert) replaces the search.
  useEffect(() => {
    const next = fromParams(params);
    setF(next); setText(next.q || "");
    if (params.focus) setTimeout(() => input.current?.focus(), 250);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramKey]);
  useEffect(() => { getPref<Recent[]>("recentSearches", []).then(setRecent); }, []);
  useEffect(() => { if (focused && !allFacets) pub<Facets>("/api/lots/facets").then(setAllFacets).catch(() => undefined); }, [focused, allFacets]);

  const load = useCallback(async (page = 1) => {
    const qs = toQueryString(f, { page: page > 1 ? String(page) : "", ...(page > 1 ? { facets: "0" } : {}) });
    const r = await pub<SearchResult>(`/api/lots/search${qs ? `?${qs}` : ""}`);
    return r;
  }, [f]);

  useEffect(() => {
    let live = true;
    setRes(null); setErr("");
    load(1).then((r) => { if (live) setRes(r); }).catch((e) => { if (live) setErr(errText(e)); });
    return () => { live = false; };
  }, [key, load]);

  async function loadMore() {
    if (!res?.hasMore || more) return;
    setMore(true);
    try {
      const r = await load(res.page + 1);
      setRes((cur) => cur ? { ...cur, lots: [...cur.lots, ...r.lots.filter((l) => !cur.lots.some((x) => x.id === l.id))], hasMore: r.hasMore, page: r.page } : r);
    } catch { /* try again on next scroll */ }
    setMore(false);
  }

  const set = (patch: SearchFilters) => setF((cur) => {
    const next: SearchFilters = { ...cur, ...patch };
    for (const [k, v] of Object.entries(patch)) if (!v) delete next[k as FilterKey];
    return cleanFilters(next);
  });
  const remove = (k: FilterKey) => { const p: SearchFilters = {}; for (const x of CHIP_REMOVES[k] || [k]) p[x] = ""; set(p); if (k === "q") setText(""); };

  async function apply(next: SearchFilters, label: string) {
    Keyboard.dismiss(); setFocused(false);
    const clean = cleanFilters(next);
    setF(clean); setText(clean.q || "");
    const list = [{ label, f: clean }, ...recent.filter((r) => JSON.stringify(r.f) !== JSON.stringify(clean))].slice(0, 5);
    setRecent(list); void setPref("recentSearches", list);
  }
  function submit() {
    const t = text.trim();
    if (!t) { void apply({}, "All vehicles"); return; }
    if (/^#?\d{5,7}$/.test(t)) { Keyboard.dismiss(); setFocused(false); router.push(`/lot/${t.replace("#", "")}`); return; }
    const p = parseQuery(t);
    void apply(p.f, describe(p.f) || t);
  }
  function pick(sg: Suggestion) {
    if (sg.kind === "lot") { Keyboard.dismiss(); setFocused(false); router.push(sg.href.replace(/^\/lot\//, "/lot/") as never); return; }
    void apply(sg.f, describe(sg.f) || sg.label);
  }

  async function saveSearch() {
    if (!signedIn) { router.push(`/join?next=${encodeURIComponent(`/search?${key}`)}`); return; }
    try {
      await api("/api/saved-searches", { body: { label: describe(f), query: f } });
      setSaved(key);
      void askForPush();
    } catch (e) { setErr(errText(e)); }
  }

  const items = useMemo(() => (focused && text.trim() ? suggest(text, allFacets, 8) : []), [focused, text, allFacets]);
  const parsed = useMemo(() => (focused && text.trim() ? parseQuery(text) : null), [focused, text]);
  const understood = parsed && Object.keys(parsed.f).some((k) => k !== "q") ? parsed.parts.join(" · ") : "";
  const facets = res?.facets || null;
  const total = facets?.total ?? null;
  const chips = chipsFor(f);
  const catTotal = facets?.cats ? Object.values(facets.cats).reduce((a, b) => a + b, 0) : null;
  const sortLabel = (v: string, l: string) => (f.view === "closed" && v === "ending" ? "Most recently closed" : l);

  const header = (
    <View style={{ gap: 14, paddingBottom: 6 }}>
      <T v="d3">{heading(f)}</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingRight: 20 }} style={{ marginRight: -20 }}>
        <Pill label="All" count={catTotal ?? undefined} on={!f.cat} onPress={() => { const p: SearchFilters = { cat: "", type: "" }; CAT_KEYS.forEach((k) => (p[k] = "")); set(p); }} />
        {CATEGORIES.map((c) => <Pill key={c.key} label={c.short} count={facets?.cats ? facets.cats[c.key] || 0 : undefined} on={f.cat === c.key} onPress={() => { const p: SearchFilters = { cat: c.key, type: "" }; CAT_KEYS.forEach((k) => (p[k] = "")); set({ ...p, cat: c.key }); }} />)}
        <Pill label="Under $5k" count={facets?.cheap ?? undefined} on={f.cat === "cheap"} onPress={() => set({ cat: "cheap", type: "" })} />
      </ScrollView>
      <View style={s.bar}>
        <Text style={s.count} accessibilityLiveRegion="polite">{total == null ? "Searching…" : `${total.toLocaleString("en-AU")} ${total === 1 ? "vehicle" : "vehicles"}`}</Text>
        <Pressable testID="open-filters" accessibilityRole="button" onPress={() => setSheet(true)} style={s.filterBtn}>
          <Icon name="filter" size={18} color="#FFFFFF" /><Text style={s.filterText}>Filters{chips.length ? ` (${chips.length})` : ""}</Text>
        </Pressable>
      </View>
      {chips.length ? (
        <View style={s.chips}>
          {chips.map(([k, label]) => (
            <Pressable key={k} accessibilityRole="button" accessibilityLabel={`Remove ${label}`} onPress={() => remove(k)} style={s.chip}>
              <Text style={s.chipText}>{label}</Text><Text style={s.chipX}>×</Text>
            </Pressable>
          ))}
          <Text accessibilityRole="button" onPress={() => { setF({}); setText(""); }} style={s.clear}>Clear all</Text>
        </View>
      ) : null}
      <Segmented options={[["", "Live"], ["offers", "Make an offer"], ["closed", "Closed"]]} value={(f.view || "") as "" | "offers" | "closed"} onChange={(v) => set({ view: v })} />
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}>
        <Select label="Sort" value={(f.sort || "ending") as string} placeholder="Closing soonest" options={SORTS.map(([v, l]) => [v, sortLabel(v, l)] as [string, string])} onChange={(v) => set({ sort: v === "ending" ? "" : v })} />
        {chips.length ? <Button small kind={saved === key ? "soft" : "dark"} title={saved === key ? "Saved ✓" : "Save search"} onPress={saved === key ? undefined : saveSearch} style={{ marginBottom: 6 }} /> : null}
      </View>
      {err ? <Text style={{ color: C.badInk, fontFamily: F.semibold }}>{err}</Text> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top + 8 }}>
      <View style={{ paddingHorizontal: 20, paddingBottom: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={[s.searchBox, focused && s.searchFocus]}>
          <Icon name="search" color={C.muted} size={20} />
          <TextInput ref={input} testID="search-input" value={text} onChangeText={setText} onFocus={() => setFocused(true)} onSubmitEditing={submit}
            placeholder="Try “LAMS bike” or “caravan sleeps 4”" placeholderTextColor={C.muted} returnKeyType="search" autoCorrect={false} autoCapitalize="none"
            accessibilityLabel="Search cars, utes, trucks, motorbikes, caravans, boats and more" style={[s.searchInput, Platform.OS === "web" && ({ outlineStyle: "none" } as object)]} />
          {text ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => { setText(""); input.current?.focus(); }} style={s.x}><Text style={{ fontSize: 16, color: C.ink2 }}>✕</Text></Pressable> : null}
        </View>
        {focused ? <Text accessibilityRole="button" onPress={() => { Keyboard.dismiss(); setFocused(false); setText(f.q || ""); }} style={s.cancel}>Cancel</Text> : null}
      </View>

      {focused ? (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 4 }} testID="suggestions">
          {understood ? <Text style={s.understood}>We’ll search for <Text style={{ color: C.ink, fontFamily: F.bold }}>{understood}</Text></Text> : null}
          {items.map((sg, i) => (
            <Pressable key={`${sg.kind}-${sg.label}-${i}`} testID={`suggestion-${i}`} accessibilityRole="button" onPress={() => pick(sg)} style={({ pressed }) => [s.sug, pressed && { backgroundColor: C.panel }]}>
              <View style={[s.sugIc, sg.kind === "smart" && { backgroundColor: C.blue }]}><Text style={{ color: sg.kind === "smart" ? "#FFFFFF" : C.ink2, fontSize: 12 }}>{ICON[sg.kind]}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={s.sugText} numberOfLines={1}>{sg.label}</Text>
                {sg.sub ? <Text style={s.sugSub}>{sg.sub}</Text> : null}
              </View>
              {sg.count != null ? <Text style={s.sugCount}>{sg.count ? `${sg.count.toLocaleString("en-AU")} live` : "None live"}</Text> : null}
            </Pressable>
          ))}
          {!text.trim() ? (
            <>
              {recent.length ? <Text style={s.h}>Recent searches</Text> : null}
              {recent.map((r) => (
                <Pressable key={r.label} accessibilityRole="button" onPress={() => apply(r.f, r.label)} style={s.sug}>
                  <View style={s.sugIc}><Text style={{ color: C.ink2 }}>↺</Text></View><Text style={[s.sugText, { flex: 1 }]} numberOfLines={1}>{r.label}</Text>
                </Pressable>
              ))}
              <Text style={s.h}>Browse</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {CATEGORIES.map((c) => (
                  <Pressable key={c.key} accessibilityRole="button" onPress={() => apply({ cat: c.key }, c.label)} style={s.browse}>
                    <Text style={s.sugText}>{c.short}</Text>
                    <Text style={s.sugSub}>{allFacets?.cats ? `${(allFacets.cats[c.key] || 0).toLocaleString("en-AU")} live` : " "}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}
        </ScrollView>
      ) : (
        <FlatList
          testID="results"
          data={res?.lots || []}
          keyExtractor={(l) => String(l.id)}
          renderItem={({ item }) => <LotCard lot={item} watched={watched.has(item.id)} onWatch={toggle} />}
          ItemSeparatorComponent={() => <View style={{ height: 24 }} />}
          ListHeaderComponent={header}
          ListHeaderComponentStyle={{ marginBottom: 16 }}
          ListEmptyComponent={!res ? (err ? <Empty title="Can't search right now." sub={err}><Button title="Try again" onPress={() => setF({ ...f })} /></Empty> : <Loading label="Searching…" />) : (
            <Empty title={f.cat && CAT[f.cat] ? `No ${CAT[f.cat].label.toLowerCase()} match that yet.` : "Nothing matches that yet."} sub="Remove a filter, or save this search and we’ll tell you the moment one is listed.">
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {chips.slice(0, 4).map(([k, label]) => <Pill key={k} label={`Remove ${label} ×`} onPress={() => remove(k)} style={{ backgroundColor: "#FFFFFF" }} />)}
              </View>
              {chips.length ? <Button small kind={saved === key ? "soft" : "blue"} title={saved === key ? "Saved ✓" : "Save this search"} onPress={saved === key ? undefined : saveSearch} /> : null}
            </Empty>
          )}
          ListFooterComponent={more ? <Loading label="Loading more…" /> : null}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={4}
          windowSize={7}
        />
      )}
      <FilterSheet visible={sheet} onClose={() => setSheet(false)} f={f} facets={facets} set={set} total={total} onClear={() => { setF(f.view ? { view: f.view } : {}); setText(""); }} />
    </View>
  );
}

const s = StyleSheet.create({
  searchBox: { flex: 1, height: 52, borderRadius: 26, backgroundColor: C.panel, flexDirection: "row", alignItems: "center", paddingLeft: 16, paddingRight: 8, gap: 8, borderWidth: 2, borderColor: "transparent" },
  searchFocus: { borderColor: C.blue, backgroundColor: "#FFFFFF" },
  searchInput: { flex: 1, height: "100%", fontFamily: F.medium, fontSize: 16, color: C.ink },
  x: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.panel2, alignItems: "center", justifyContent: "center" },
  cancel: { fontFamily: F.bold, fontSize: 15, color: C.blue, paddingVertical: 12 },
  understood: { fontFamily: F.medium, fontSize: 14, color: C.muted, paddingVertical: 8 },
  sug: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 14 },
  sugIc: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.panel, alignItems: "center", justifyContent: "center" },
  sugText: { fontFamily: F.bold, fontSize: 16, color: C.ink },
  sugSub: { fontFamily: F.medium, fontSize: 13, color: C.muted },
  sugCount: { fontFamily: F.bold, fontSize: 13, color: C.muted },
  h: { fontFamily: F.heavy, fontSize: 12, letterSpacing: 0.8, color: C.muted, textTransform: "uppercase", marginTop: 14, marginBottom: 4 },
  browse: { width: "48.5%", borderRadius: 16, backgroundColor: C.panel, padding: 12 },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  count: { fontFamily: F.heavy, fontSize: 20, letterSpacing: -0.4, color: C.ink },
  filterBtn: { height: 40, borderRadius: 20, paddingHorizontal: 16, backgroundColor: C.ink, flexDirection: "row", alignItems: "center", gap: 6 },
  filterText: { color: "#FFFFFF", fontFamily: F.bold, fontSize: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  chip: { height: 34, borderRadius: 17, paddingLeft: 14, paddingRight: 8, backgroundColor: C.sun, flexDirection: "row", alignItems: "center", gap: 6 },
  chipText: { fontFamily: F.bold, fontSize: 14, color: C.ink },
  chipX: { fontFamily: F.heavy, fontSize: 15, color: C.ink, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.12)", textAlign: "center", lineHeight: 20, overflow: "hidden" },
  clear: { fontFamily: F.bold, fontSize: 14, color: C.blue, paddingHorizontal: 4 },
});
