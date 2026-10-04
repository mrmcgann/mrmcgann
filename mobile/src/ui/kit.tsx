import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
  type StyleProp, type TextInputProps, type TextStyle, type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C, F, PAD, R } from "./theme";

// ---------- text ----------
type Variant = "d1" | "d2" | "d3" | "h" | "title" | "body" | "strong" | "muted" | "small" | "label" | "eyebrow" | "serif";
const TV: Record<Variant, TextStyle> = {
  d1: { fontFamily: F.heavy, fontSize: 46, lineHeight: 46, letterSpacing: -2.2, color: C.ink },
  d2: { fontFamily: F.heavy, fontSize: 36, lineHeight: 38, letterSpacing: -1.5, color: C.ink },
  d3: { fontFamily: F.heavy, fontSize: 28, lineHeight: 31, letterSpacing: -1, color: C.ink },
  h: { fontFamily: F.heavy, fontSize: 21, lineHeight: 25, letterSpacing: -0.5, color: C.ink },
  title: { fontFamily: F.heavy, fontSize: 18, lineHeight: 22, letterSpacing: -0.3, color: C.ink },
  body: { fontFamily: F.medium, fontSize: 16, lineHeight: 23, color: C.ink },
  strong: { fontFamily: F.bold, fontSize: 16, lineHeight: 22, color: C.ink },
  muted: { fontFamily: F.medium, fontSize: 15, lineHeight: 21, color: C.muted },
  small: { fontFamily: F.medium, fontSize: 13, lineHeight: 18, color: C.muted },
  label: { fontFamily: F.bold, fontSize: 14, lineHeight: 18, color: C.ink },
  eyebrow: { fontFamily: F.bold, fontSize: 13, lineHeight: 17, letterSpacing: 0.4, color: C.muted, textTransform: "uppercase" },
  serif: { fontFamily: F.serif, fontSize: 36, lineHeight: 40, color: C.blue },
};
export function T({ v = "body", style, children, numberOfLines, selectable, accessibilityRole }: { v?: Variant; style?: StyleProp<TextStyle>; children: ReactNode; numberOfLines?: number; selectable?: boolean; accessibilityRole?: "header" | "text" }) {
  return <Text style={[TV[v], style]} numberOfLines={numberOfLines} selectable={selectable} accessibilityRole={accessibilityRole ?? (v.startsWith("d") || v === "h" ? "header" : undefined)}>{children}</Text>;
}

// ---------- buttons ----------
type BtnKind = "blue" | "dark" | "soft" | "white" | "danger";
const BK: Record<BtnKind, [string, string]> = { blue: [C.blue, "#FFFFFF"], dark: [C.ink, "#FFFFFF"], soft: [C.panel, C.ink], white: ["#FFFFFF", C.ink], danger: [C.badBg, C.badInk] };
export function Button({ title, onPress, kind = "blue", busy, disabled, small, style, icon, testID }: {
  title: string; onPress?: () => void; kind?: BtnKind; busy?: boolean; disabled?: boolean; small?: boolean; style?: StyleProp<ViewStyle>; icon?: ReactNode; testID?: string;
}) {
  const [bg, fg] = BK[kind];
  const off = disabled || busy;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ disabled: !!off, busy: !!busy }} accessibilityLabel={title}
      disabled={!!off} aria-disabled={!!off} onPress={off ? undefined : onPress}
      style={({ pressed }) => [s.btn, small && s.btnSmall, { backgroundColor: off ? C.panel2 : bg, transform: [{ scale: pressed && !off ? 0.98 : 1 }] }, style]}>
      {busy ? <ActivityIndicator color={kind === "soft" || kind === "white" ? C.ink : "#FFFFFF"} /> : (
        <>{icon}<Text style={[s.btnText, small && { fontSize: 15 }, { color: off ? C.muted : fg }]} numberOfLines={1}>{title}</Text></>
      )}
    </Pressable>
  );
}
export function LinkText({ title, onPress, color = C.blue, style, testID }: { title: string; onPress: () => void; color?: string; style?: StyleProp<TextStyle>; testID?: string }) {
  return <Text testID={testID} accessibilityRole="link" onPress={onPress} style={[{ fontFamily: F.bold, fontSize: 15, color }, style]}>{title}</Text>;
}

// ---------- pills, tags, notices ----------
export function Pill({ label, on, onPress, count, style, testID }: { label: string; on?: boolean; onPress?: () => void; count?: number; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress} style={[s.pill, { backgroundColor: on ? C.ink : C.panel }, style]}>
      <Text style={[s.pillText, { color: on ? "#FFFFFF" : C.ink2 }]}>{label}{count != null ? <Text style={{ opacity: 0.6, fontFamily: F.semibold }}>{`  ${count.toLocaleString("en-AU")}`}</Text> : null}</Text>
    </Pressable>
  );
}
export function Tag({ label, color = C.panel, ink = C.ink }: { label: string; color?: string; ink?: string }) {
  return <View style={[s.tag, { backgroundColor: color }]}><Text style={[s.tagText, { color: ink }]} numberOfLines={1}>{label}</Text></View>;
}
export function Notice({ kind = "sun", children, style }: { kind?: "sun" | "ok" | "bad" | "info"; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const bg = kind === "ok" ? C.mint : kind === "bad" ? C.badBg : kind === "info" ? C.panel : C.sun;
  return <View accessibilityRole="alert" style={[s.notice, { backgroundColor: bg }, style]}>{typeof children === "string" ? <T v="strong" style={{ fontSize: 15, lineHeight: 21 }}>{children}</T> : children}</View>;
}
export function Soft({ children, style, bg = C.panel, testID }: { children: ReactNode; style?: StyleProp<ViewStyle>; bg?: string; testID?: string }) {
  return <View testID={testID} style={[s.soft, { backgroundColor: bg }, style]}>{children}</View>;
}

// ---------- fields ----------
export function Field({ label, error, hint, style, inputStyle, ...rest }: TextInputProps & { label: string; error?: string; hint?: string; inputStyle?: StyleProp<TextStyle> }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={[{ gap: 7 }, style]}>
      <T v="label">{label}</T>
      <TextInput placeholderTextColor={C.muted} accessibilityLabel={label} {...rest}
        onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }} onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
        style={[s.input, Platform.OS === "web" && ({ outlineStyle: "none" } as object), { borderColor: error ? C.berry : focus ? C.blue : "transparent", backgroundColor: focus ? "#FFFFFF" : C.panel }, rest.multiline && { height: 110, paddingTop: 14, textAlignVertical: "top" }, inputStyle]} />
      {error ? <T v="small" style={{ color: C.badInk, fontFamily: F.semibold }}>{error}</T> : hint ? <T v="small">{hint}</T> : null}
    </View>
  );
}
export const digits = (s: string) => Number(String(s).replace(/[^0-9]/g, "")) || 0;
export function MoneyField({ value, onChange, label, hint, error, testID }: { value: string; onChange: (v: string) => void; label: string; hint?: string; error?: string; testID?: string }) {
  const n = digits(value);
  return (
    <View style={{ gap: 7 }}>
      <T v="label">{label}</T>
      <View style={[s.money, error ? { borderColor: C.berry } : null]}>
        <Text style={s.moneySign}>$</Text>
        <TextInput testID={testID} accessibilityLabel={label} keyboardType="number-pad" inputMode="numeric" value={n ? n.toLocaleString("en-AU") : ""} onChangeText={(t) => onChange(String(digits(t) || ""))} style={[s.moneyInput, Platform.OS === "web" && ({ outlineStyle: "none" } as object)]} placeholder="0" placeholderTextColor={C.muted} />
      </View>
      {error ? <T v="small" style={{ color: C.badInk, fontFamily: F.semibold }}>{error}</T> : hint ? <T v="small">{hint}</T> : null}
    </View>
  );
}
export function Check({ checked, onChange, children, testID }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
      <View style={[s.box, checked && { backgroundColor: C.blue, borderColor: C.blue }]}>{checked ? <Text style={{ color: "#FFFFFF", fontFamily: F.heavy, fontSize: 14, lineHeight: 16 }}>✓</Text> : null}</View>
      <View style={{ flex: 1 }}>{typeof children === "string" ? <T v="body" style={{ fontSize: 15, lineHeight: 21 }}>{children}</T> : children}</View>
    </Pressable>
  );
}
/** One of a few options, as a card with a radio dot (title, then a hint or anything else below). */
export function Choice({ on, onPress, title, hint, children, testID }: { on: boolean; onPress: () => void; title: string; hint?: ReactNode; children?: ReactNode; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={onPress} style={[s.choice, on && { borderColor: C.ink }]}>
      <View style={[s.radio, on && { borderColor: C.ink }]}>{on ? <View style={s.radioDot} /> : null}</View>
      <View style={{ flex: 1, gap: 3 }}>
        <T v="strong" style={{ fontSize: 15, lineHeight: 21 }}>{title}</T>
        {typeof hint === "string" ? <T v="small">{hint}</T> : hint}
        {children}
      </View>
    </Pressable>
  );
}
/** Two to five options side by side. With `testID`, each option gets `${testID}-${key}`. */
export function Segmented<K extends string>({ options, value, onChange, testID }: { options: [K, string][]; value: K; onChange: (k: K) => void; testID?: string }) {
  return (
    <View style={s.seg} accessibilityRole="tablist">
      {options.map(([k, l]) => (
        <Pressable key={k} testID={testID ? `${testID}-${k || "any"}` : undefined} accessibilityRole="tab" accessibilityState={{ selected: value === k }} onPress={() => onChange(k)} style={[s.segItem, value === k && s.segOn]}>
          <Text style={[s.segText, value === k && { color: C.ink }]} numberOfLines={1}>{l}</Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Select<K extends string>({ label, value, options, onChange, placeholder = "Any", testID }: { label: string; value: K | ""; options: [K, string][]; onChange: (k: K | "") => void; placeholder?: string; testID?: string }) {
  const [open, setOpen] = useState(false);
  const cur = options.find((o) => o[0] === value)?.[1];
  return (
    <View style={{ gap: 7, flex: 1 }}>
      <T v="label">{label}</T>
      <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={`${label}: ${cur || placeholder}`} onPress={() => setOpen(true)} style={[s.input, { justifyContent: "center" }]}>
        <Text style={{ fontFamily: F.medium, fontSize: 16, color: cur ? C.ink : C.muted }} numberOfLines={1}>{cur || placeholder}</Text>
        <Text style={s.caret}>⌄</Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label} scroll>
        {[["" as K | "", placeholder] as [K | "", string], ...options].map(([k, l]) => (
          <Pressable key={k || "_any"} accessibilityRole="button" onPress={() => { onChange(k); setOpen(false); }} style={[s.option, value === k && { backgroundColor: C.panel }]}>
            <Text style={{ fontFamily: value === k ? F.heavy : F.semibold, fontSize: 17, color: C.ink }}>{l}</Text>
            {value === k ? <Text style={{ color: C.blue, fontFamily: F.heavy }}>✓</Text> : null}
          </Pressable>
        ))}
      </Sheet>
    </View>
  );
}

// ---------- layout ----------
export function Screen({ children, refreshing, onRefresh, style, contentStyle, keyboard, testID }: {
  children: ReactNode; refreshing?: boolean; onRefresh?: () => void; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle>; keyboard?: boolean; testID?: string;
}) {
  const insets = useSafeAreaInsets();
  const body = (
    <ScrollView testID={testID} style={[{ flex: 1, backgroundColor: C.bg }, style]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
      contentContainerStyle={[{ padding: PAD, paddingBottom: 40 + insets.bottom, gap: 20 }, contentStyle]}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.muted} /> : undefined}>
      {children}
    </ScrollView>
  );
  return keyboard ? <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>{body}</KeyboardAvoidingView> : body;
}
export function Row({ title, sub, onPress, right, badge, testID }: { title: string; sub?: string; onPress?: () => void; right?: ReactNode; badge?: number; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole={onPress ? "button" : undefined} onPress={onPress} style={({ pressed }) => [s.row, pressed && onPress ? { opacity: 0.6 } : null]}>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="strong">{title}</T>
        {sub ? <T v="small" numberOfLines={2}>{sub}</T> : null}
      </View>
      {badge ? <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View> : null}
      {right ?? (onPress ? <Text style={{ fontSize: 22, color: C.muted, fontFamily: F.semibold }}>›</Text> : null)}
    </Pressable>
  );
}
export function Empty({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <View style={s.empty}>
      <T v="h" style={{ textAlign: "center" }}>{title}</T>
      {sub ? <T v="muted" style={{ textAlign: "center" }}>{sub}</T> : null}
      {children}
    </View>
  );
}
export function Loading({ label = "Loading…" }: { label?: string }) {
  return <View style={{ padding: 40, alignItems: "center", gap: 12 }}><ActivityIndicator color={C.muted} /><T v="small">{label}</T></View>;
}
export function Divider() { return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: C.line }} />; }
export function LineItem({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 5 }}>
      <T v={bold ? "strong" : "muted"} style={{ flexShrink: 1 }}>{k}</T>
      <T v={bold ? "strong" : "body"} style={{ fontVariant: ["tabular-nums"] }}>{v}</T>
    </View>
  );
}

// Bottom sheet for confirmations, pickers and the filter panel.
export function Sheet({ visible, onClose, title, children, scroll, footer, testID }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode; scroll?: boolean; footer?: ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets();
  // The dim backdrop fades in; only the panel slides up.
  const rise = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!visible) return;
    rise.setValue(1);
    Animated.spring(rise, { toValue: 0, useNativeDriver: Platform.OS !== "web", damping: 22, stiffness: 220, mass: 0.8 }).start();
  }, [visible, rise]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View testID={testID} style={[s.sheet, { paddingBottom: (footer ? 12 : 24) + insets.bottom, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, 320] }) }] }]} accessibilityViewIsModal>
          <View style={s.grab} />
          {title ? (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
              <T v="h" style={{ flex: 1 }}>{title}</T>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={s.close}><Text style={{ fontSize: 18, color: C.ink, fontFamily: F.bold }}>✕</Text></Pressable>
            </View>
          ) : null}
          {scroll ? <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: 14, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">{children}</ScrollView> : <View style={{ gap: 14 }}>{children}</View>}
          {footer ? <View style={{ paddingTop: 12, gap: 10 }}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ---------- time ----------
// One shared clock for every countdown on screen.
const listeners = new Set<(n: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
export function useNow(active = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    listeners.add(setNow);
    if (!timer) timer = setInterval(() => { const t = Date.now(); listeners.forEach((l) => l(t)); }, 1000);
    return () => { listeners.delete(setNow); if (!listeners.size && timer) { clearInterval(timer); timer = null; } };
  }, [active]);
  return now;
}

const s = StyleSheet.create({
  btn: { height: 54, borderRadius: 27, paddingHorizontal: 26, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 10 },
  btnSmall: { height: 42, borderRadius: 21, paddingHorizontal: 18 },
  btnText: { fontFamily: F.bold, fontSize: 17 },
  pill: { height: 38, borderRadius: 19, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  pillText: { fontFamily: F.bold, fontSize: 14 },
  tag: { height: 28, borderRadius: 14, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  tagText: { fontFamily: F.heavy, fontSize: 12.5 },
  notice: { padding: 14, paddingHorizontal: 16, borderRadius: 16, gap: 6 },
  soft: { borderRadius: R.soft, padding: 20, gap: 10 },
  input: { height: 54, borderRadius: R.field, borderWidth: 2, borderColor: "transparent", backgroundColor: C.panel, paddingHorizontal: 16, fontFamily: F.medium, fontSize: 17, color: C.ink },
  caret: { position: "absolute", right: 16, top: 12, fontSize: 18, color: C.muted },
  money: { flexDirection: "row", alignItems: "center", height: 64, borderRadius: 18, borderWidth: 2, borderColor: C.line, backgroundColor: "#FFFFFF", paddingHorizontal: 16, gap: 6 },
  moneySign: { fontFamily: F.heavy, fontSize: 26, color: C.muted },
  moneyInput: { flex: 1, fontFamily: F.heavy, fontSize: 28, color: C.ink, letterSpacing: -0.6, height: "100%" },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: C.line, alignItems: "center", justifyContent: "center", marginTop: 1, backgroundColor: "#FFFFFF" },
  choice: { flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1.5, borderColor: C.line },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: C.line, alignItems: "center", justifyContent: "center", marginTop: 0, backgroundColor: "#FFFFFF" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.ink },
  seg: { flexDirection: "row", backgroundColor: C.panel, borderRadius: 22, padding: 4, gap: 4 },
  segItem: { flex: 1, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  segOn: { backgroundColor: "#FFFFFF", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 },
  segText: { fontFamily: F.bold, fontSize: 14, color: C.ink2 },
  option: { minHeight: 52, borderRadius: 14, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  badge: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: C.berry, alignItems: "center", justifyContent: "center", paddingHorizontal: 7 },
  badgeText: { color: "#FFFFFF", fontFamily: F.heavy, fontSize: 12 },
  empty: { padding: 28, borderRadius: R.card, backgroundColor: C.panel, alignItems: "center", gap: 10 },
  backdrop: { flex: 1, backgroundColor: "rgba(29,29,31,0.4)" },
  sheet: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: PAD, paddingTop: 10, maxHeight: "92%" },
  grab: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 10 },
  close: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.panel, alignItems: "center", justifyContent: "center" },
});
