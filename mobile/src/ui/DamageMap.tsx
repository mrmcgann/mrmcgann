import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, G, Path, Text as SvgText } from "react-native-svg";
import { OFF_DIAGRAM, PANELS, ZONE_LABEL, flawPins, hasDiagram, type Zone } from "@/lib/damage";
import { T } from "./kit";
import { C, F } from "./theme";

/** Where each flaw is (the website's DamageMap): a top-down drawing with numbered pins, or the parts in words. */
export function DamageMap({ flaws, category }: { flaws: { zone?: string | null; title: string }[]; category: string }) {
  const pins = flawPins(flaws);
  if (!pins.size) return null;
  const drawn = hasDiagram(category);
  const listed = [...pins.entries()].filter(([z]) => !drawn || OFF_DIAGRAM.includes(z));
  return (
    <View style={s.box} testID="damage-map" accessible accessibilityLabel={`Damage map: ${[...pins.entries()].map(([z, n]) => `${ZONE_LABEL[z]} (${n.join(", ")})`).join("; ")}`}>
      {drawn ? (
        <Svg width={140} height={294} viewBox="0 -20 200 420">
          <Path d="M44 14 Q100 -4 156 14 L186 58 L188 344 L156 390 Q100 404 44 390 L12 344 L14 58 Z" fill="#FFFFFF" stroke={C.line} strokeWidth={2} />
          {PANELS.map((p) => <Path key={p.zone} d={p.d} fill={pins.has(p.zone) ? "#FFE3D2" : "#FFFFFF"} stroke={pins.has(p.zone) ? C.urgent : C.panel2} strokeWidth={pins.has(p.zone) ? 2 : 1.5} />)}
          <Path d="M58 266 L142 266 L148 296 L52 296 Z" fill={C.panel2} />
          <SvgText x={100} y={-8} fill={C.muted} fontSize={11} fontWeight="700" textAnchor="middle">Front</SvgText>
          {PANELS.filter((p) => pins.has(p.zone)).map((p) => (
            <G key={p.zone}>
              <Circle cx={p.cx} cy={p.cy} r={pins.get(p.zone)!.length > 1 ? 15 : 11} fill={C.urgent} />
              <SvgText x={p.cx} y={p.cy + 4.5} fill="#FFFFFF" fontSize={13} fontWeight="800" textAnchor="middle">{pins.get(p.zone)!.join(",")}</SvgText>
            </G>
          ))}
        </Svg>
      ) : null}
      <View style={{ flex: 1, gap: 8 }}>
        <T v="small">{drawn ? "Seen from above, front at the top. Numbers match the list below. Left is the passenger side." : "Where each one is (numbers match the list below):"}</T>
        {listed.map(([z, n]) => <View key={z} style={s.row}><Text style={s.num}>{n.join(", ")}</Text><T v="body" style={{ fontSize: 15 }}>{ZONE_LABEL[z as Zone]}</T></View>)}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  box: { flexDirection: "row", gap: 14, padding: 14, borderRadius: 22, backgroundColor: C.panel, alignItems: "flex-start" },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  num: { minWidth: 24, paddingHorizontal: 6, height: 24, lineHeight: 24, borderRadius: 12, overflow: "hidden", backgroundColor: C.urgent, color: "#FFFFFF", fontFamily: F.heavy, fontSize: 12, textAlign: "center" },
});
