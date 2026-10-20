import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { lotFees, priceBreakdown } from "@/lib/fees";
import { dateTime, km, money } from "@/lib/format";
import { ackPayLine } from "@/lib/deposits";
import { rightsLine } from "@/lib/listing";
import { liveLine, quickBids, resultLine, secondsLeft, type LiveLot, type LiveSale } from "@/lib/live";
import { api, ApiError, errText, pub } from "~/lib/api";
import { SITE, photoUrl } from "~/lib/env";
import { useSession } from "~/lib/session";
import { supabase } from "~/lib/supabase";
import type { Fees, Lot } from "~/lib/types";
import { Button, Check, Empty, LineItem, Loading, Notice, Screen, Sheet, Soft, T, Tag } from "~/ui/kit";
import { CarArt } from "~/ui/art";
import { C, F } from "~/ui/theme";

type Room = { sale: LiveSale; current: LiveLot | null; next: LiveLot[]; done: LiveLot[]; waiting: number; server_time: string };

// The live auction room in the app (the website's /live/[slug]): the vehicle that's up, its price and countdown,
// one-tap bids, what's next and the results so far. Broadcast on sale:<id> and lot:<id>, with the edge-cached
// /api/sales/[slug]/live as the catch-up and fallback. The video stream, when there is one, opens in the browser.
export default function LiveRoomScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { me, signedIn } = useSession();
  const userId = me?.user?.id || null;
  const [room, setRoom] = useState<Room | null>(null);
  const [fees, setFees] = useState<Fees | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [skew, setSkew] = useState(0);
  const [rt, setRt] = useState(false);
  const [, setTick] = useState(0);
  const [agreed, setAgreed] = useState(false);
  const [ask, setAsk] = useState<number | null>(null);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const j = await pub<Room>(`/api/sales/${slug}/live`);
      setSkew(new Date(j.server_time).getTime() - Date.now());
      setRoom((prev) => (prev?.current && j.current && prev.current.id === j.current.id && j.current.bid_count < prev.current.bid_count && j.current.status === prev.current.status ? { ...j, current: prev.current } : j));
      setErr(null);
    } catch (e) { setErr(e instanceof ApiError && e.status === 404 ? "This live auction isn't available." : errText(e)); }
  }, [slug]);
  useEffect(() => { void load(); pub<{ fees: Fees }>("/api/app/config").then((c) => setFees(c.fees)).catch(() => undefined); }, [load]);

  const saleId = room?.sale.id;
  const curId = room?.current?.id;
  useEffect(() => {
    if (!saleId) return;
    const ch = supabase.channel(`sale:${saleId}`, { config: { private: false } })
      .on("broadcast", { event: "sale" }, ({ payload }) => { setRoom((r) => (r ? { ...r, sale: { ...r.sale, ...(payload as Partial<LiveSale>) } } : r)); void load(); })
      .subscribe((st) => setRt(st === "SUBSCRIBED"));
    const sub = AppState.addEventListener("change", (st) => { if (st === "active") void load(); });
    return () => { sub.remove(); void supabase.removeChannel(ch); };
  }, [saleId, load]);
  useEffect(() => {
    if (!curId) return;
    const ch = supabase.channel(`lot:${curId}`, { config: { private: false } })
      .on("broadcast", { event: "lot" }, ({ payload }) => {
        const p = payload as Partial<LiveLot> & { id: number };
        setRoom((r) => (r?.current && r.current.id === p.id && !(p.bid_count !== undefined && p.bid_count < r.current.bid_count && p.status === r.current.status) ? { ...r, current: { ...r.current, ...p } as LiveLot } : r));
        if (p.status && p.status !== "live") setTimeout(() => void load(), 400);
      }).subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [curId, load]);
  useEffect(() => {
    const every = rt ? 15_000 : room?.sale.live_status === "running" ? 2_000 : 10_000;
    const t = setInterval(() => { if (AppState.currentState === "active") void load(); }, every);
    return () => clearInterval(t);
  }, [rt, room?.sale.live_status, load]);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 250); return () => clearInterval(t); }, []);

  const cur = room?.current || null;
  const sale = room?.sale;
  const open = !!cur && cur.live_state === "open" && cur.status === "live";
  const paused = sale?.live_status === "paused";
  const left = open && !paused ? secondsLeft(cur!.ends_at, skew) : 0;
  const zeroFor = useRef<number | null>(null);
  useEffect(() => { if (open && left === 0 && zeroFor.current !== curId) { zeroFor.current = curId ?? null; const t = setTimeout(() => void load(), 1500); return () => clearTimeout(t); } }, [open, left, curId, load]);
  const f = useMemo(() => (fees && cur ? lotFees(fees, cur as unknown as Lot) : fees), [fees, cur]);
  const leading = !!userId && !!cur && cur.leader_id === userId;

  async function place(amount: number) {
    if (!cur) return;
    setBusy(true); setMsg(null);
    try {
      const d = await api<{ status: string; current_bid: number; ends_at: string }>("/api/bid", { body: { lotId: cur.id, max: amount } });
      setRoom((r) => (r?.current ? { ...r, current: { ...r.current, current_bid: d.current_bid, ends_at: d.ends_at, leader_id: d.status === "leading" ? userId : r.current.leader_id, bid_count: r.current.bid_count + 1 } } : r));
      if (Platform.OS !== "web") Haptics.notificationAsync(d.status === "leading" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
      setMsg(d.status === "leading" ? { kind: "ok", text: `You're in front at ${money(d.current_bid)}.` } : { kind: "bad", text: `Another bidder's maximum is higher: ${money(d.current_bid)}.` });
    } catch (e) { setMsg({ kind: "bad", text: errText(e) }); }
    setBusy(false); setAsk(null);
    void load();
  }
  function tap(amount: number) {
    if (!signedIn) { router.push(`/join?next=${encodeURIComponent(`/live/${slug}`)}`); return; }
    if (me?.missing?.length) { router.push(`/join?step=${me.missing[0]}`); return; }
    if (me?.profile?.terms_current === false && cur) { router.push(`/lot/${cur.id}`); return; }
    if (agreed) void place(amount); else { setAck(false); setAsk(amount); }
  }

  const head = <Stack.Screen options={{ title: "Live auction" }} />;
  if (err && !room) return <>{head}<Screen><Empty title="Can't open the live auction." sub={err}><Button title="Try again" onPress={load} /></Empty></Screen></>;
  if (!room || !sale) return <>{head}<Loading /></>;
  const windowSecs = Math.max(sale.lot_seconds, sale.extend_seconds);
  const preview = ask != null && f ? priceBreakdown(ask, f) : null;

  return (
    <>
      {head}
      <Screen testID="live-room" contentStyle={{ gap: 18 }}>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Tag label={sale.live_status === "running" ? "Live now" : paused ? "Paused" : sale.live_status === "ended" ? "Finished" : `Starts ${dateTime(sale.starts_at)}`} color={sale.live_status === "running" ? C.ink : paused ? C.sun : C.panel} ink={sale.live_status === "running" ? "#FFFFFF" : C.ink} />
          </View>
          <T v="d2">{sale.title}.</T>
          {sale.auctioneer ? <T v="small">Auctioneer: {sale.auctioneer}</T> : null}
          {sale.stream_url && sale.live_status !== "ended" ? <Button small kind="soft" title="Watch the stream" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/live/${sale.slug}`)} /> : null}
        </View>
        {sale.live_message && sale.live_status !== "scheduled" ? <View style={[s.call, paused && { backgroundColor: C.panel }]} testID="live-message"><Text style={s.callText}>{sale.live_message}</Text></View> : null}

        {cur ? (
          <View style={s.box} testID="live-console">
            <View style={s.photo}>{cur.cover_path ? <Image source={{ uri: photoUrl(cur.cover_path) || undefined }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={{ alignItems: "center", paddingTop: 30 }}><CarArt type="car" width={220} /></View>}</View>
            <T v="small">{cur.sale_order ? `Lot ${cur.sale_order}` : `Lot ${cur.id}`} · {[cur.year, cur.odometer != null ? km(cur.odometer) : null, [cur.suburb, cur.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</T>
            <T v="title" style={{ fontSize: 22, lineHeight: 27 }}>{cur.title}</T>
            <Pressable onPress={() => router.push(`/lot/${cur.id}`)}><Text style={s.link}>Full listing and condition report ›</Text></Pressable>
            {open || cur.status === "sold" ? (
              <View>
                <Text style={s.k}>{cur.status === "sold" ? "Sold for" : "Current bid"}</Text>
                <Text style={s.price} testID="live-price">{money(cur.status === "sold" ? cur.sold_price : cur.current_bid)}</Text>
                {open && f ? <T v="small" style={{ fontFamily: F.bold, color: C.ink }}>{money(priceBreakdown(Math.max(Number(cur.current_bid) || 0, Number(cur.start_price) || 0), f).total, true)} all-in · {cur.bid_count} bids</T> : null}
              </View>
            ) : <View><Text style={s.k}>Result</Text><Text style={[s.price, { fontSize: 30 }]} testID="live-price">{resultLine(cur).replace(/\.$/, "")}</Text></View>}
            {open ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={s.bar}><View style={[s.fill, { width: `${Math.min(100, (left / windowSecs) * 100)}%` }, left <= 5 && { backgroundColor: C.urgent }]} /></View>
                <Text style={[s.secs, left <= 5 && { color: C.urgent }]} testID="live-seconds">{paused ? "Paused" : left > 0 ? `${left}s` : "Closing…"}</Text>
              </View>
            ) : null}
            {open || cur.status === "sold" ? <T v="strong">{liveLine(sale, cur)}</T> : null}
            {open && userId && cur.leader_id ? <Tag label={leading ? "You're the highest bidder" : "Bid to get in front"} color={leading ? C.mint : C.panel} /> : null}
            {open && !paused ? quickBids(cur).map((b, i) => (
              <Button key={b} testID={i === 0 ? "live-bid" : undefined} kind={i === 0 ? "blue" : "soft"} disabled={busy || leading} busy={busy && i === 0}
                title={`Bid ${money(b)}${f ? ` · ${money(priceBreakdown(b, f).total, true)} all-in` : ""}`} onPress={() => tap(b)} />
            )) : null}
            {msg ? <Notice kind={msg.kind}>{msg.text}</Notice> : null}
          </View>
        ) : (
          <Soft><T v="strong">{sale.live_status === "ended" ? "The sale has finished." : sale.live_status === "scheduled" ? `Starts ${dateTime(sale.starts_at)}.` : "Next vehicle coming up."}</T>
            <T v="muted">{sale.live_status === "ended" ? "Thanks for bidding. Results are below." : `${room.waiting} vehicle${room.waiting === 1 ? "" : "s"} to go. Bid early on any of them and we bid for you up to your maximum when it's offered.`}</T></Soft>
        )}

        {room.next.length ? (
          <View style={{ gap: 10 }}>
            <T v="d3">Coming up.</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
              {room.next.map((l) => (
                <Pressable key={l.id} style={s.card} onPress={() => router.push(`/lot/${l.id}`)} testID="live-next">
                  <View style={s.thumb}>{l.cover_path ? <Image source={{ uri: photoUrl(l.cover_path) || undefined }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}</View>
                  <T v="strong" numberOfLines={2}>{l.title}</T>
                  <T v="small">{l.bid_count ? `${money(l.current_bid)} early bid` : `From ${money(l.start_price)}`}</T>
                  <Text style={s.link}>Bid early ›</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
        {room.done.length ? (
          <View style={{ gap: 6 }}>
            <T v="d3">Results so far.</T>
            {room.done.map((l) => <View key={l.id} style={s.result} testID="live-result"><T v="body" style={{ flex: 1 }} numberOfLines={1}>{l.title}</T><T v="strong">{resultLine(l)}</T></View>)}
          </View>
        ) : null}
        <T v="small">Each bid is binding. The price and countdown here are what count; a video stream can run a few seconds behind. The auctioneer may also take bids from registered, verified buyers in the room or by phone.</T>
      </Screen>

      <Sheet visible={ask != null} onClose={() => setAsk(null)} title={ask != null ? `Bid ${money(ask)}?` : ""} scroll testID="live-agree-sheet"
        footer={<>
          <Button testID="live-agree" title={ask != null ? `Bid ${money(ask)}` : "Bid"} busy={busy} disabled={!ack} onPress={() => { setAgreed(true); if (ask != null) void place(ask); }} />
          <Button kind="soft" title="Cancel" onPress={() => setAsk(null)} />
        </>}>
        {preview ? <View>
          <LineItem k="Your bid" v={money(preview.price)} />
          <LineItem k="Premium, GST and admin fee" v={money(preview.subtotal - preview.price, true)} />
          <LineItem k="All-in if you win at this bid" v={money(preview.total, true)} bold />
        </View> : null}
        <Soft style={{ padding: 14 }}>
          <Check testID="live-ack" checked={ack} onChange={setAck}>{`For this sale, each tap of a bid button is a binding bid. I understand vehicles are sold as is, where is, the condition report is a guide only, and ${ackPayLine(preview?.payMode || "transfer")}, under the terms of sale.`}</Check>
          <Text style={s.link} onPress={() => WebBrowser.openBrowserAsync(`${SITE}/terms#t-live`)}>How live auctions work ›</Text>
        </Soft>
        <T v="small">{rightsLine("auction", null)}.</T>
      </Sheet>
    </>
  );
}

const s = StyleSheet.create({
  call: { alignSelf: "flex-start", paddingHorizontal: 18, paddingVertical: 12, borderRadius: 18, backgroundColor: C.sun },
  callText: { fontFamily: F.serif, fontSize: 26, color: C.ink, letterSpacing: -0.4 },
  box: { borderRadius: 28, borderWidth: 1, borderColor: C.line, padding: 16, gap: 12, backgroundColor: "#FFFFFF" },
  photo: { height: 200, borderRadius: 20, overflow: "hidden", backgroundColor: C.panel },
  k: { fontFamily: F.bold, fontSize: 13, color: C.muted },
  price: { fontFamily: F.heavy, fontSize: 46, letterSpacing: -1.4, color: C.ink, fontVariant: ["tabular-nums"] },
  bar: { flex: 1, height: 12, borderRadius: 6, backgroundColor: C.panel2, overflow: "hidden" },
  fill: { height: 12, borderRadius: 6, backgroundColor: C.ink },
  secs: { fontFamily: F.heavy, fontSize: 24, color: C.ink, minWidth: 84, textAlign: "right", fontVariant: ["tabular-nums"] },
  link: { fontFamily: F.bold, fontSize: 15, color: C.blue },
  card: { width: 200, gap: 4 },
  thumb: { height: 130, borderRadius: 18, overflow: "hidden", backgroundColor: C.panel },
  result: { flexDirection: "row", gap: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
});
