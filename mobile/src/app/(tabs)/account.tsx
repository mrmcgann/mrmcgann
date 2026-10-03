import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { dateLong, maskMobile, money } from "@/lib/format";
import { APP_VERSION, SITE } from "~/lib/env";
import { supabase } from "~/lib/supabase";
import { STEP_NAMES, useSession } from "~/lib/session";
import { Button, Divider, Row, Screen, Soft, T, Tag } from "~/ui/kit";
import { Icon, LogoMark } from "~/ui/art";
import { C, F } from "~/ui/theme";

type Inv = { id: string; ref: string; status: string; total: number; created_at: string; lots: { title: string } | null };
const INV_TAG: Record<string, [string, string]> = {
  pending_charge: [C.sun, "Processing"], charging: [C.sun, "Processing"], paid: [C.mint, "Paid"], deposit_paid: [C.sun, "Balance due"], payment_failed: [C.berry, "Payment failed"], cancelled: [C.panel2, "Cancelled"],
};
const web = (p: string) => () => WebBrowser.openBrowserAsync(`${SITE}${p}`);

export default function Account() {
  const insets = useSafeAreaInsets();
  const { signedIn, me, refresh, signOut, config } = useSession();
  const [invoices, setInvoices] = useState<Inv[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const uid = me?.user?.id;
  const load = useCallback(async () => {
    if (!uid) return;
    const { data } = await supabase.from("invoices").select("id, ref, status, total, created_at, lots(title)").eq("buyer_id", uid).order("created_at", { ascending: false }).limit(50);
    setInvoices((data || []) as unknown as Inv[]);
  }, [uid]);
  useFocusEffect(useCallback(() => { void load(); void refresh(); }, [load, refresh]));

  const help = (
    <View>
      <Row title="Help centre" onPress={web("/help")} />
      <Row title="Terms of sale" onPress={web("/terms")} />
      <Row title="Privacy policy" onPress={web("/privacy")} />
      <Row title="Contact us" sub={config ? `${config.phone} · ${config.supportEmail}` : undefined} onPress={web("/contact")} />
    </View>
  );

  if (!signedIn) {
    return (
      <Screen contentStyle={{ paddingTop: insets.top + 20 }} testID="account">
        <LogoMark size={40} />
        <T v="d2">Your next car is <Text style={{ fontFamily: F.serif, color: C.blue }}>already here.</Text></T>
        <T v="muted" style={{ fontSize: 17, lineHeight: 24 }}>Join free to bid, watch vehicles and get outbid alerts. Verify once (mobile, card and ID) and you're ready for every auction.</T>
        <Button testID="account-join" title="Join free" onPress={() => router.push("/join")} />
        <Button kind="soft" title="Sign in" onPress={() => router.push("/signin")} />
        {help}
        <T v="small" style={{ textAlign: "center" }}>Tyrebiter {APP_VERSION}</T>
      </Screen>
    );
  }

  const p = me?.profile;
  const missing = me?.missing || [];
  const steps: [number, string, boolean, string][] = [
    [2, STEP_NAMES[2], !!p?.details_done, p?.details_done ? `${p.first_name} ${p.last_name}, ${p.suburb} ${p.state}` : "Legal name, date of birth and address"],
    [3, STEP_NAMES[3], !!p?.mobile_verified, p?.mobile_verified ? maskMobile(p.mobile) : "We text you a code"],
    [4, STEP_NAMES[4], !!p?.payment_method_id, p?.payment_method_id ? `${p.card_brand} ending ${p.card_last4}` : "Charged only if you win"],
    [5, STEP_NAMES[5], p?.id_status === "verified", p?.id_status === "verified" ? "Verified" : p?.id_status === "pending" ? "Checking now" : "Licence or passport, and a selfie"],
  ];
  return (
    <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await Promise.all([load(), refresh()]); setRefreshing(false); }} contentStyle={{ paddingTop: insets.top + 20 }} testID="account">
      <T v="d2">Hi{p?.first_name ? `, ${p.first_name}` : ""}.</T>
      <T v="muted">{me?.user?.email}</T>

      <Soft bg={missing.length ? C.panel : C.mint}>
        <T v="h">{missing.length ? "Finish verifying to bid." : "You're ready to bid."}</T>
        {steps.map(([n, label, ok, detail]) => (
          <Pressable key={n} accessibilityRole="button" onPress={() => router.push(`/join?step=${n}&next=/account`)} style={s.step}>
            <View style={[s.tick, { backgroundColor: ok ? (missing.length ? C.mint : "#FFFFFF") : C.panel2 }]}>{ok ? <Icon name="check" size={14} strokeWidth={3.2} /> : <Text style={{ fontFamily: F.heavy, fontSize: 13 }}>{n - 1}</Text>}</View>
            <View style={{ flex: 1 }}><T v="strong">{label}</T><T v="small">{detail}</T></View>
            <Text style={{ fontFamily: F.bold, color: C.blue }}>{ok ? "Update" : "Finish"}</Text>
          </Pressable>
        ))}
      </Soft>

      <View>
        <Row testID="row-notifications" title="Notifications" sub="Everything we've sent you" badge={p?.unread || 0} onPress={() => router.push("/notifications")} />
        <Row title="Alerts" sub="Outbid, ending soon, saved searches: push, SMS or email" onPress={() => router.push("/alerts")} />
        <Row title="Account settings" sub="Business details, password, email" onPress={() => router.push("/settings")} />
        {p?.is_seller ? <Row title="My vehicles for sale" onPress={() => router.push("/sell")} /> : null}
      </View>

      <View style={{ gap: 10 }}>
        <T v="d3">Invoices.</T>
        {invoices === null ? <T v="muted">Loading…</T> : invoices.length === 0 ? <T v="muted">When you win, your tax invoice, payment and collection details appear here.</T> : invoices.map((inv) => {
          const [bg, label] = INV_TAG[inv.status] || [C.panel, inv.status];
          return (
            <Pressable key={inv.id} accessibilityRole="button" onPress={() => router.push(`/invoice/${inv.id}`)} style={s.inv}>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="strong" numberOfLines={1}>{inv.lots?.title || "Vehicle"}</T>
                <T v="small">{inv.ref} · {dateLong(inv.created_at)} · {money(inv.total, true)}</T>
              </View>
              <Tag label={label} color={bg} />
            </Pressable>
          );
        })}
      </View>

      {help}
      <Divider />
      <Button kind="soft" title="Sign out" onPress={signOut} />
      <Text accessibilityRole="button" onPress={() => router.push("/delete-account")} style={s.delete}>Delete my account</Text>
      <T v="small" style={{ textAlign: "center" }}>Tyrebiter {APP_VERSION}</T>
    </Screen>
  );
}

const s = StyleSheet.create({
  step: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  tick: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  inv: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: C.line },
  delete: { fontFamily: F.bold, fontSize: 15, color: C.badInk, textAlign: "center", padding: 8 },
});
