import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as WebBrowser from "expo-web-browser";
import { dateLong, dateTime, money } from "@/lib/format";
import { api, errText } from "~/lib/api";
import { SITE } from "~/lib/env";
import { downloadAndShare } from "~/lib/files";
import { supabase } from "~/lib/supabase";
import { useSession } from "~/lib/session";
import type { AppLot } from "~/lib/types";
import { Button, Loading, Notice, Screen, Sheet, Soft, T, Tag } from "~/ui/kit";
import { CarArt } from "~/ui/art";
import { C, F } from "~/ui/theme";

const STATUS: Record<string, [string, string]> = {
  draft: ["Getting ready", C.panel], scheduled: ["Scheduled", C.sky], live: ["Live now", C.mint], referred: ["Decision needed", C.sun],
  offers: ["Taking offers", C.sun], sold: ["Sold", C.lime], passed: ["Didn't sell", C.panel], cancelled: ["Withdrawn", C.panel],
};
type Offer = { id: string; amount: number; status: string; created_at: string };
type Coll = { status: string; confirmed_for: string | null; collector: string; seller_token: string | null; collected_at: string | null };
type Payout = { id: string; lot_id: number; status: string; net_amount: number; hold_reason: string | null; paid_at: string | null };
type Item = { lot: AppLot; offers: Offer[]; coll: Coll | null; watchers: number; payout: Payout | undefined };
type Decision = { lotId: number; kind: "referral" | "offer"; offerId?: string; amount: number; accept: boolean };

export default function Sell() {
  const insets = useSafeAreaInsets();
  const { signedIn, me } = useSession();
  const uid = me?.user?.id;
  const [items, setItems] = useState<Item[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // The website's seller dashboard queries, with this member's session.
  const load = useCallback(async () => {
    if (!uid) { setItems([]); return; }
    const { data: rows } = await supabase.from("lots").select("*").eq("seller_id", uid).order("created_at", { ascending: false }).limit(50);
    const lots = (rows || []) as AppLot[];
    const { data: payouts } = await supabase.from("seller_payouts").select("id, lot_id, status, net_amount, hold_reason, paid_at").eq("seller_id", uid);
    const extra = await Promise.all(lots.map(async (l) => {
      const [offers, coll, watchers] = await Promise.all([
        ["referred", "offers"].includes(l.status) ? supabase.rpc("seller_lot_offers", { p_lot: l.id }) : Promise.resolve({ data: [] }),
        l.status === "sold" ? supabase.rpc("seller_lot_collection", { p_lot: l.id }) : Promise.resolve({ data: [] }),
        supabase.rpc("lot_watchers", { p_lot: l.id }),
      ]);
      return { lot: l, offers: (offers.data || []) as Offer[], coll: ((coll.data || []) as Coll[])[0] || null, watchers: Number(watchers.data || 0), payout: ((payouts || []) as Payout[]).find((p) => p.lot_id === l.id) };
    }));
    setItems(extra);
  }, [uid]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function decide() {
    if (!decision) return;
    setBusy(true);
    try {
      await api("/api/seller/decide", { body: { lotId: decision.lotId, action: `${decision.accept ? "accept" : "decline"}_${decision.kind}`, offerId: decision.offerId } });
      setMsg({ ok: true, text: decision.accept ? "Accepted. It's sold and we're taking payment from the buyer now." : "Declined." });
      setDecision(null);
      await load();
    } catch (e) { setMsg({ ok: false, text: errText(e) }); setDecision(null); }
    setBusy(false);
  }

  const intro = (
    <View style={{ gap: 14 }}>
      <T v="eyebrow" style={{ color: C.grape }}>Sell with Tyrebiter</T>
      <Text style={s.hero}>Skip the{"\n"}<Text style={{ fontFamily: F.serif, color: C.grape }}>tyre-kickers.</Text></Text>
      <T v="muted" style={{ fontSize: 17, lineHeight: 24 }}>Leave it in your driveway. We photograph it at your place, sell it to buyers right across Australia, and pay you when the buyer settles.</T>
      <View style={s.band}><CarArt type="ute" width={240} /></View>
      <Button title="Get a free appraisal" onPress={() => router.push("/appraisal")} />
      {[["1", "Free appraisal", "Tell us about it. We call with a price range and a suggested reserve.", C.tangerine], ["2", "We come to you", "Our photographer shoots a full walkaround and condition report at your place.", C.sun],
        ["3", "7-day auction", "Live to buyers nationwide. Watch every bid from your phone.", C.lime], ["4", "Viewings by appointment", "We book ID-verified bidders in with you. You just open the gate.", C.sky],
        ["5", "Get paid", "The buyer pays us and collects from you. Your money lands within 3 business days of collection.", C.grape]].map(([n, h, b, c]) => (
        <View key={n} style={{ flexDirection: "row", gap: 14, alignItems: "flex-start" }}>
          <View style={[s.dot, { backgroundColor: c }]}><Text style={[s.dotText, n === "5" && { color: "#FFFFFF" }]}>{n}</Text></View>
          <View style={{ flex: 1 }}><T v="title">{h}</T><T v="muted">{b}</T></View>
        </View>
      ))}
      <Text style={s.link} onPress={() => WebBrowser.openBrowserAsync(`${SITE}/seller-agreement`)}>Read the Seller Agency Agreement ›</Text>
    </View>
  );

  return (
    <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} contentStyle={{ paddingTop: insets.top + 20 }} testID="sell">
      {!signedIn || (items && items.length === 0) ? intro : !items ? <Loading /> : (
        <>
          <T v="eyebrow" style={{ color: C.grape }}>Selling</T>
          <T v="d2">Your vehicles.</T>
          {msg ? <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice> : null}
          {items.map(({ lot: l, offers, coll, watchers, payout: p }) => {
            const [label, colour] = STATUS[l.status] || [l.status, C.panel];
            const pending = offers.filter((o) => o.status === "pending");
            return (
              <View key={l.id} style={s.card}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
                  <Text style={s.title} onPress={() => router.push(`/lot/${l.id}`)}>{l.title}</Text>
                  <Tag label={label} color={colour} />
                </View>
                <View style={s.facts}>
                  {[[l.status === "sold" ? "Sold for" : "Current bid", money(l.status === "sold" ? l.sold_price : l.current_bid)], ["Bids", String(l.bid_count)], ["Watching", String(watchers)], ["Views", (l.views || 0).toLocaleString("en-AU")],
                    [l.status === "live" ? "Ends" : "Reserve", l.status === "live" ? dateTime(l.ends_at) : l.has_reserve ? (l.reserve_met ? "Met" : "Not met") : "None"]].map(([k, v]) => (
                    <View key={k} style={s.fact}><T v="small">{k}</T><T v="strong">{v}</T></View>
                  ))}
                </View>
                {l.status === "draft" ? <T v="muted">We're checking your papers and preparing the listing. We'll text you when it goes live.</T> : null}
                {l.status === "referred" ? (
                  <Notice>
                    <T v="strong">Bidding ended at {money(l.current_bid)}, below your reserve. Decide by {dateLong(l.decision_by)}.</T>
                    <T v="body" style={{ fontSize: 14 }}>If you accept, it's sold and we take payment from the buyer now. If you decline (or don't answer in time), we open offers.</T>
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
                      <Button small title={`Accept ${money(l.current_bid)}`} onPress={() => setDecision({ lotId: l.id, kind: "referral", amount: Number(l.current_bid), accept: true })} />
                      <Button small kind="white" title="Decline" onPress={() => setDecision({ lotId: l.id, kind: "referral", amount: Number(l.current_bid), accept: false })} />
                    </View>
                  </Notice>
                ) : null}
                {l.status === "offers" ? (
                  <Notice>
                    <T v="strong">Offers are open until {dateLong(l.decision_by)}.</T>
                    {pending.length === 0 ? <T v="body" style={{ fontSize: 14 }}>No offers yet. We'll text you as each one arrives.</T> : pending.map((o) => (
                      <View key={o.id} style={{ gap: 6, marginTop: 4 }}>
                        <T v="strong">{money(o.amount)} <Text style={{ fontFamily: F.medium, color: C.ink2 }}>· {dateTime(o.created_at)}</Text></T>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <Button small title="Accept" onPress={() => setDecision({ lotId: l.id, kind: "offer", offerId: o.id, amount: Number(o.amount), accept: true })} />
                          <Button small kind="white" title="Decline" onPress={() => setDecision({ lotId: l.id, kind: "offer", offerId: o.id, amount: Number(o.amount), accept: false })} />
                        </View>
                      </View>
                    ))}
                  </Notice>
                ) : null}
                {l.status === "sold" ? (
                  <View style={{ gap: 8 }}>
                    {!coll ? <T v="body">We're taking payment from the buyer. We'll text you once they book a collection time.</T> : null}
                    {coll?.status === "requested" ? <T v="body">The buyer has asked to collect. We'll call you to confirm a time.</T> : null}
                    {coll?.status === "confirmed" ? (
                      <>
                        <T v="body">Collection: <Text style={{ fontFamily: F.bold }}>{coll.confirmed_for}</Text> by <Text style={{ fontFamily: F.bold }}>{coll.collector}</Text>.</T>
                        <T v="muted">Only hand over the keys when they give you the 6-digit release code. Never accept money from them directly.</T>
                        {coll.seller_token ? <Button small title="Open the handover page" onPress={() => router.push(`/handover/${coll.seller_token}`)} style={{ alignSelf: "flex-start" }} /> : null}
                      </>
                    ) : null}
                    {coll?.status === "collected" ? <Notice kind="ok">{`Collected ${dateLong(coll.collected_at)}. Remember to lodge your notice of disposal with your state's transport authority.`}</Notice> : null}
                    {p ? (
                      <Soft>
                        <T v="strong">Payout: {money(p.net_amount, true)}</T>
                        <T v="muted">{p.status === "paid" ? `Paid ${dateLong(p.paid_at)}` : p.status === "ready" ? "Being paid now" : p.status === "on_hold" ? `On hold (${p.hold_reason})` : "After collection and the buyer's claim window"}</T>
                        <Button small kind="dark" title="Settlement statement" onPress={() => downloadAndShare(`${SITE}/api/payouts/${p.id}/pdf`, `settlement-${l.id}.pdf`).catch((e) => setMsg({ ok: false, text: errText(e) }))} style={{ alignSelf: "flex-start" }} />
                      </Soft>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
          <Button kind="soft" title="Sell another vehicle" onPress={() => router.push("/appraisal")} />
          <Text style={s.link} onPress={() => WebBrowser.openBrowserAsync(`${SITE}/seller-agreement`)}>Read the Seller Agency Agreement ›</Text>
        </>
      )}
      <Sheet visible={!!decision} onClose={() => setDecision(null)} title={decision ? `${decision.accept ? "Accept" : "Decline"} ${money(decision.amount)}?` : ""}
        footer={<><Button title={decision?.accept ? "Accept and sell" : "Decline"} kind={decision?.accept ? "blue" : "dark"} busy={busy} onPress={decide} /><Button kind="soft" title="Cancel" onPress={() => setDecision(null)} /></>}>
        <T v="muted">{decision?.accept ? "This is binding: the vehicle is sold at this price and we take payment from the buyer now." : decision?.kind === "referral" ? "We'll open offers on your vehicle." : "The buyer is told their offer wasn't accepted."}</T>
      </Sheet>
    </Screen>
  );
}

const s = StyleSheet.create({
  hero: { fontFamily: F.heavy, fontSize: 44, lineHeight: 46, letterSpacing: -2, color: C.ink },
  band: { borderRadius: 28, backgroundColor: C.berry, height: 160, alignItems: "center", justifyContent: "flex-end", paddingBottom: 24 },
  dot: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  dotText: { fontFamily: F.heavy, fontSize: 15, color: C.ink },
  link: { fontFamily: F.bold, fontSize: 15, color: C.blue },
  card: { borderRadius: 26, borderWidth: 1, borderColor: C.line, padding: 16, gap: 12 },
  title: { flex: 1, fontFamily: F.heavy, fontSize: 20, lineHeight: 24, letterSpacing: -0.4, color: C.ink },
  facts: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  fact: { minWidth: "30%", flexGrow: 1, backgroundColor: C.panel, borderRadius: 14, padding: 10, gap: 2 },
});
