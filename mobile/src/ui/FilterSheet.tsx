import { Pressable, StyleSheet, Text, View } from "react-native";
import { CATEGORIES, CAT, FUELS, TRANS, DRIVES, LICENCES, STATE_NAMES, makesFor, modelsFor } from "@/lib/vehicles";
import { ENDINGS, type Facets, type SearchFilters } from "@/lib/search";
import { GRADES } from "@/lib/grades";
import { Button, Check, Select, Sheet, T } from "./kit";
import { C, F } from "./theme";

const YEARS = Array.from({ length: 45 }, (_, i) => String(new Date().getFullYear() + 1 - i));
const PRICES = [1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000, 150000, 250000];
const KMS = [10000, 30000, 50000, 75000, 100000, 150000, 200000, 300000, 500000];
const HOURS = [100, 250, 500, 1000, 2000, 5000, 10000];
const CCS = [50, 125, 250, 300, 400, 500, 650, 750, 900, 1000, 1200, 1800];
const LENGTHS = [3, 4, 5, 6, 7, 8, 10, 12, 15];
export const CAT_KEYS: (keyof SearchFilters)[] = ["type", "lams", "lic", "berths", "ccmin", "ccmax", "lenmin", "lenmax", "hrs"];
const n = (v?: number) => (v == null ? "" : ` (${v.toLocaleString("en-AU")})`);
const $ = (v: number) => "$" + v.toLocaleString("en-AU");

/** Every filter, Trade Me Motors-style, with live counts (the website's SearchFilterPanel). */
export function FilterSheet({ visible, onClose, f, facets, set, total, onClear }: {
  visible: boolean; onClose: () => void; f: SearchFilters; facets: Facets | null; set: (patch: SearchFilters) => void; total: number | null; onClear: () => void;
}) {
  const cat = f.cat && f.cat !== "cheap" ? CAT[f.cat] : null;
  const extras = cat ? cat.extras : [];
  const usage = cat ? cat.usage : "km";
  const liveMakes = Object.entries(facets?.makes || {}).sort((a, b) => b[1] - a[1]).map(([m]) => m);
  const allMakes = [...liveMakes, ...makesFor(f.cat).filter((m) => !liveMakes.includes(m)).sort()];
  if (f.make && !allMakes.includes(f.make)) allMakes.unshift(f.make);
  const liveModels = Object.entries(facets?.models || {}).filter(([k]) => f.make && k.toLowerCase().startsWith(f.make.toLowerCase() + "|")).sort((a, b) => b[1] - a[1]).map(([k]) => k.split("|")[1]);
  const models = [...liveModels, ...modelsFor(f.make, f.cat).filter((m) => !liveModels.some((x) => x.toLowerCase() === m.toLowerCase()))];
  if (f.model && !models.some((m) => m.toLowerCase() === f.model!.toLowerCase())) models.unshift(f.model);

  const chips = (key: keyof SearchFilters, opts: [string, string][], counts?: Record<string, number>) => (
    <View style={s.chips}>
      <Chip label="Any" on={!f[key]} onPress={() => set({ [key]: "" })} />
      {opts.map(([v, l]) => <Chip key={v} label={l} count={counts ? counts[v] || 0 : undefined} on={f[key] === v} onPress={() => set({ [key]: f[key] === v ? "" : v })} />)}
    </View>
  );
  const pair = (a: keyof SearchFilters, b: keyof SearchFilters, la: string, lb: string, opts: [string, string][], pa: string, pb: string) => (
    <View style={{ flexDirection: "row", gap: 10 }}>
      <Select label={la} value={(f[a] || "") as string} options={opts} placeholder={pa} onChange={(v) => set({ [a]: v })} />
      <Select label={lb} value={(f[b] || "") as string} options={opts} placeholder={pb} onChange={(v) => set({ [b]: v })} />
    </View>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title="Filters" scroll testID="filters"
      footer={<View style={{ flexDirection: "row", gap: 10 }}>
        <Button kind="soft" title="Clear all" onPress={onClear} style={{ flex: 1 }} />
        <Button testID="filters-show" title={total == null ? "Show vehicles" : `Show ${total.toLocaleString("en-AU")} ${total === 1 ? "vehicle" : "vehicles"}`} onPress={onClose} style={{ flex: 2 }} />
      </View>}>
      <Select label="Category" value={f.cat || ""} placeholder={`All vehicles${n(facets?.total)}`}
        options={[...CATEGORIES.map((c) => [c.key, c.label + n(facets?.cats?.[c.key] || 0)] as [string, string]), ["cheap", "Under $5,000" + n(facets?.cheap)]]}
        onChange={(v) => { const p: SearchFilters = { cat: v, km: "" }; CAT_KEYS.forEach((k) => (p[k] = "")); set(p); }} />
      {cat ? <Select label="Type" value={f.type || ""} placeholder={`Any ${cat.one} type`} options={cat.kinds.map(([k, l]) => [k, l + n(facets?.types?.[k] || 0)] as [string, string])} onChange={(v) => set({ type: v })} /> : null}
      <Select label="Make" value={f.make || ""} placeholder="Any make" options={allMakes.map((m) => [m, m + n(facets?.makes?.[m] ?? (facets ? 0 : undefined))] as [string, string])} onChange={(v) => set({ make: v, model: "" })} />
      {f.make ? <Select label="Model" value={f.model || ""} placeholder="Any model" options={models.map((m) => [m, m + n(facets?.models?.[`${f.make}|${m}`] ?? (facets ? 0 : undefined))] as [string, string])} onChange={(v) => set({ model: v })} /> : null}
      {pair("min", "max", "Price from", "Price to", PRICES.map((p) => [String(p), $(p)]), "No min", "No max")}
      {pair("ymin", "ymax", "Year from", "Year to", YEARS.map((y) => [y, y]), "Any", "Any")}
      {usage === "km" ? <Select label="Kilometres" value={f.km || ""} placeholder="Any kilometres" options={KMS.map((k) => [String(k), `Under ${k.toLocaleString("en-AU")} km`])} onChange={(v) => set({ km: v })} /> : null}
      {usage === "hours" || extras.includes("hours") ? <Select label="Engine hours" value={f.hrs || ""} placeholder="Any hours" options={HOURS.map((h) => [String(h), `Under ${h.toLocaleString("en-AU")} hrs`])} onChange={(v) => set({ hrs: v })} /> : null}
      {extras.includes("cc") ? <>
        {pair("ccmin", "ccmax", "Engine size from", "Engine size to", CCS.map((c) => [String(c), `${c} cc`]), "Any", "Any")}
        <Check checked={f.lams === "1"} onChange={(v) => set({ lams: v ? "1" : "" })}>LAMS approved (learners)</Check>
      </> : null}
      {extras.includes("lic") ? <Select label="Licence you hold" value={f.lic || ""} placeholder="Any licence" options={LICENCES} onChange={(v) => set({ lic: v })} /> : null}
      {extras.includes("berths") ? <Select label="Sleeps at least" value={f.berths || ""} placeholder="Any" options={[1, 2, 3, 4, 5, 6, 8].map((b) => [String(b), `${b}+`])} onChange={(v) => set({ berths: v })} /> : null}
      {extras.includes("length") ? pair("lenmin", "lenmax", "Length from", "Length to", LENGTHS.map((l) => [String(l), `${l} m`]), "Any", "Any") : null}
      {usage !== "none" ? <View style={{ gap: 8 }}><T v="label">Transmission</T>{chips("trans", TRANS, facets?.trans)}</View> : null}
      {f.cat !== "trailers" && f.cat !== "caravans" ? <View style={{ gap: 8 }}><T v="label">Fuel</T>{chips("fuel", FUELS, facets?.fuels)}</View> : null}
      {!cat || extras.includes("drive") ? <View style={{ gap: 8 }}><T v="label">Drive</T>{chips("drive", DRIVES, facets?.drives)}</View> : null}
      <Select label="Location" value={f.state || ""} placeholder="All of Australia" options={Object.entries(STATE_NAMES).map(([k, l]) => [k, l + n(facets?.states?.[k] ?? (facets ? 0 : undefined))] as [string, string])} onChange={(v) => set({ state: v })} />
      <View style={{ gap: 8 }}><T v="label">Seller</T>{chips("seller", [["private", "Private"], ["business", "Business (GST)"]])}</View>
      <Select label="Visual grade" value={f.grade || ""} placeholder="Any grade" options={GRADES.slice(0, 4).map(([g, l]) => [g, g === "A" ? "A · Excellent" : `${g} · ${l} or better`] as [string, string])} onChange={(v) => set({ grade: v })} />
      <Check checked={f.nores === "1"} onChange={(v) => set({ nores: v ? "1" : "" })}>No reserve, or reserve met</Check>
      <Check checked={f.buynow === "1"} onChange={(v) => set({ buynow: v ? "1" : "" })}>Buy Now available</Check>
      <Select label="Ending" value={f.ending || ""} placeholder="Ending any time" options={ENDINGS} onChange={(v) => set({ ending: v })} />
    </Sheet>
  );
}

function Chip({ label, on, onPress, count }: { label: string; on: boolean; onPress: () => void; count?: number }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={[s.chip, on && { backgroundColor: C.ink }]}>
      <Text style={[s.chipText, on && { color: "#FFFFFF" }]}>{label}{count != null ? <Text style={{ opacity: 0.6 }}>{`  ${count}`}</Text> : null}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { height: 36, borderRadius: 18, paddingHorizontal: 13, backgroundColor: C.panel, justifyContent: "center" },
  chipText: { fontFamily: F.semibold, fontSize: 14, color: C.ink2 },
});
