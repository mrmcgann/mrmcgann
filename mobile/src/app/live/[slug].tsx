import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as WebBrowser from "expo-web-browser";
import { lotFees, priceBreakdown } from "@/lib/fees";
import { dateTime, km, money } from "@/lib/format";
import { ackPayLine, buyNowPayLine } from "@/lib/deposits";
import { rightsLine, warrantySign } from "@/lib/listing";
import { allInMoney, estimateAllInText, estimateText, hasEstimate } from "@/lib/estimate";
import { liveLine, quickBids, resultLine, secondsLeft, type LiveLot, type LiveSale } from "@/lib/live";
import { api, ApiError, errText, pub } from "~/lib/api";
import { SITE, photoUrl } from "~/lib/env";
import { useSession } from "~/lib/session";
import { supabase } from "~/lib/supabase";
import type { Fees, Lot } from "~/lib/types";
import { Button, Check, Empty, LineItem, Loading, Notice, Screen, Sheet, Soft, T, Tag } from "~/ui/kit";
import { CarArt } from "~/ui/art";
import { C, F } from "~/ui/theme";
import { ACK_CHECK, feesLine, premiumLabel } from "@/lib/transport";

type Room = { sale: LiveSale; current: LiveLot | null; next: LiveLot[]; done: LiveLot[]; waiting: number; server_time: string };
// a note to this bidder about the vehicle that's up: one about the price only shows while the price is still that price
type Note = { kind: "ok" | "bad"; text: string; lot: number; price?: number };

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
  const [msg, setMsg] = useState<Note | null>(null);
  const [mineHere, setMineHere] = useState<Record<number, boolean>>({});
  const insets = useSafeAreaInsets();
  // the bar at the bottom of the screen shows while the bid buttons are scrolled out of view
  const view = useRef({ y: 0, h: 0 });
  const boxY = useRef(0);
  const bidsAt = useRef<{ y: number; h: number } | null>(null);
  const [bidsSeen, setBidsSeen] = useState(true);
  const seenCheck = useCallback(() => {
    const b = bidsAt.current, v = view.current;
    if (!b || !v.h) return;
    const top = boxY.current + b.y, seen = top + 40 < v.y + v.h - 120 && top + b.h > v.y + 20;
    setBidsSeen((was) => (was === seen ? was : seen));
  }, []);

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
  // the member's own maximums in this sale (early bids left on the listings count), so the room shows they've bid and
  // can withdraw it until the hammer falls
  const lotKey = room ? [room.current?.id, ...room.next.map((l) => l.id)].filter(Boolean).join(",") : "";
  useEffect(() => {
    if (!userId || !lotKey) return;
    let stop = false;
    void supabase.from("max_bids").select("lot_id").eq("bidder_id", userId).in("lot_id", lotKey.split(",").map(Number))
      .then(({ data }: { data: { lot_id: number }[] | null }) => {
        if (stop || !data) return;
        setMineHere((m) => { const n = { ...m }; for (const r of data) n[r.lot_id] = true; return n; });
      });
    return () => { stop = true; };
  }, [userId, lotKey]);
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
      const price = Number(d.current_bid);
      setMsg(d.status === "leading" ? { kind: "ok", text: `Bid placed. You're in front at ${money(price)}.`, lot: cur.id, price }
        : { kind: "bad", text: `Another bidder's maximum was higher, so the bid is now ${money(price)}. Bid again to get in front.`, lot: cur.id, price });
      setMineHere((m) => ({ ...m, [cur.id]: true }));
    } catch (e) { setMsg({ kind: "bad", text: errText(e), lot: cur.id }); }
    setBusy(false); setAsk(null);
    void load();
  }
  // a bid can be withdrawn until the hammer falls
  async function withdraw() {
    if (!cur) return;
    setBusy(true); setMsg(null);
    try {
      await api("/api/bid", { method: "DELETE", body: { lotId: cur.id } });
      setMineHere((m) => { const n = { ...m }; delete n[cur.id]; return n; });
      setMsg({ kind: "ok", text: "Your bid has been withdrawn.", lot: cur.id });
    } catch (e) { setMsg({ kind: "bad", text: errText(e), lot: cur.id }); }
    setBusy(false);
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
  const note = msg && cur && open && msg.lot === cur.id && (msg.price == null || Number(cur.current_bid) === msg.price) ? msg : null;
  const closed = !!cur && cur.live_state === "closed";
  const won = closed && cur!.status === "sold" && !!userId && (cur!.winner_id ?? cur!.leader_id) === userId;
  const mine = !!cur && !!mineHere[cur.id];
  const bids = cur && open && !paused ? quickBids(cur) : [];
  const allIn = cur && f ? priceBreakdown(Math.max(Number(cur.current_bid) || 0, Number(cur.start_price) || 0), f).total : 0;
  const soldAllIn = cur && f && cur.status === "sold" ? priceBreakdown(Number(cur.sold_price) || 0, f).total : 0;
  const dock = bids.length > 0 && !bidsSeen && !!f;
  const pct = `${Math.min(100, (left / windowSecs) * 100)}%` as const;

  return (
    <>
      {head}
      <Screen testID="live-room" contentStyle={{ gap: 18, paddingBottom: (dock ? 150 : 40) + insets.bottom }}
        onView={(y, h) => { view.current = { y, h }; seenCheck(); }}
        footer={dock && cur && f ? (
          <View style={[s.dock, { paddingBottom: 12 + insets.bottom }]} testID="live-dock">
            <View style={s.dockTop}>
              {mine && !leading ? <Tag label="You've been outbid" color={C.berry} /> : null}
              <View style={[s.bar, { height: 6 }]}><View style={[s.fill, { height: 6, width: pct }, left <= 5 && { backgroundColor: C.urgent }]} /></View>
              <Text style={[s.dockSecs, left <= 5 && { color: C.urgent }]}>{left > 0 ? `${left}s` : "Closing"}</Text>
            </View>
            <View style={s.dockRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.dockK}><Text style={s.dockV}>{money(cur.current_bid)}</Text> {cur.bid_count ? "bid" : "to start"}</Text>
                <Text style={s.dockK}><Text style={s.dockV}>{allInMoney(allIn)}</Text> all-in</Text>
              </View>
              {leading ? <View style={s.dockLead} testID="live-dock-lead"><Text style={s.dockLeadText}>You're in front</Text></View> : (
                <Pressable testID="live-dock-bid" accessibilityRole="button" accessibilityLabel={`Bid ${money(bids[0])}`} disabled={busy} onPress={() => tap(bids[0])}
                  style={({ pressed }) => [s.dockBtn, { opacity: busy ? 0.6 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
                  <Text style={s.dockBtnText}>Bid {money(bids[0])}</Text>
                  <Text style={s.dockBtnSmall}>{allInMoney(priceBreakdown(bids[0], f).total)} all-in</Text>
                </Pressable>
              )}
            </View>
            {note && note.kind === "bad" && note.price == null ? <Text style={s.dockErr} accessibilityRole="alert">{note.text}</Text> : null}
          </View>
        ) : null}>
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Tag label={sale.live_status === "running" ? "Live now" : paused ? "Paused" : sale.live_status === "ended" ? "Finished" : `Starts ${dateTime(sale.starts_at)}`} color={sale.live_status === "running" ? C.ink : paused ? C.sun : C.panel} ink={sale.live_status === "running" ? "#FFFFFF" : C.ink} />
          </View>
          <T v="d2">{sale.title}.</T>
          {sale.auctioneer ? <View testID="live-auctioneer" style={{ alignSelf: "flex-start" }}><Tag label={`Auctioneer: ${sale.auctioneer}`} /></View> : null}
          {sale.stream_url && sale.live_status !== "ended" ? <Button small kind="soft" title="Watch the stream" onPress={() => WebBrowser.openBrowserAsync(`${SITE}/live/${sale.slug}`)} /> : null}
        </View>
        {sale.live_message && sale.live_status !== "scheduled" ? <View style={[s.call, paused ? { backgroundColor: C.panel } : closed && cur?.status === "sold" ? { backgroundColor: C.mint } : null]} testID="live-message"><Text style={s.callText}>{sale.live_message}</Text></View> : null}

        {cur ? (
          <View style={s.box} testID="live-console" onLayout={(e) => { boxY.current = e.nativeEvent.layout.y; seenCheck(); }}>
            <View style={s.photo}>{cur.cover_path ? <Image source={{ uri: photoUrl(cur.cover_path) || undefined }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <View style={{ alignItems: "center", paddingTop: 30 }}><CarArt type="car" width={220} /></View>}</View>
            <T v="small">{cur.sale_order ? `Lot ${cur.sale_order}` : `Lot ${cur.id}`} · {[cur.year, cur.odometer != null ? km(cur.odometer) : null, [cur.suburb, cur.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</T>
            <T v="title" style={{ fontSize: 22, lineHeight: 27 }}>{cur.title}</T>
            {hasEstimate(cur) && f ? <T v="body" testID="live-estimate" style={{ fontSize: 15 }}>Estimate <Text style={{ fontFamily: F.bold }}>{estimateText(cur)}</Text> · all-in <Text style={{ fontFamily: F.bold }}>{estimateAllInText(cur, f)}</Text></T> : null}
            {f ? <T v="small" testID="live-terms">{warrantySign(cur.statutory_warranty) ? `${warrantySign(cur.statutory_warranty)} ` : ""}{premiumLabel(f)}, plus GST and the admin fee, applies.</T> : null}
            <Pressable onPress={() => router.push(`/lot/${cur.id}`)}><Text style={s.link}>Full listing and condition report ›</Text></Pressable>
            {open || cur.status === "sold" ? (
              <View>
                <Text style={s.k}>{cur.status === "sold" ? "Sold for" : "Current bid"}</Text>
                <Text style={s.price} testID="live-price">{money(cur.status === "sold" ? cur.sold_price : cur.current_bid)}</Text>
                {f ? <><Text style={s.k}>All-in</Text><Text style={s.price} testID="live-allin">{allInMoney(cur.status === "sold" ? soldAllIn : allIn)}</Text><T v="small">With the buyer's premium, GST and admin fee · {cur.bid_count} bid{cur.bid_count === 1 ? "" : "s"}</T></> : null}
              </View>
            ) : <View><Text style={s.k}>Result</Text><Text style={[s.price, { fontSize: 30 }]} testID="live-price">{resultLine(cur).replace(/\.$/, "")}</Text>
              {cur.status === "passed" ? <T v="small" testID="live-passed">{cur.bid_count ? "Bidding didn't reach the seller's reserve, so it wasn't sold and nobody owes anything." : "Nobody bid, so it wasn't sold."} It may be offered at a later auction.</T> : null}</View>}
            {open ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={s.bar}><View style={[s.fill, { width: `${Math.min(100, (left / windowSecs) * 100)}%` }, left <= 5 && { backgroundColor: C.urgent }]} /></View>
                <Text style={[s.secs, left <= 5 && { color: C.urgent }]} testID="live-seconds">{paused ? "Paused" : left > 0 ? `${left}s` : "Closing…"}</Text>
              </View>
            ) : null}
            {open ? <T v="strong">{liveLine(sale, cur)}</T> : null}
            {open && userId && (leading || mine) ? <View testID="live-you"><Tag label={leading ? "You're the highest bidder" : "You've been outbid"} color={leading ? C.mint : C.berry} /></View> : null}
            {won ? (
              <Soft bg={C.mint} testID="live-won" style={{ gap: 8 }}>
                <T v="strong" style={{ fontSize: 19 }}>You won it at {money(cur.sold_price)}.</T>
                <T v="body" style={{ fontSize: 15 }}>{(f && buyNowPayLine(priceBreakdown(Number(cur.sold_price) || 0, f))) || "Your invoice is in your account."}</T>
                <Button small kind="dark" title="See your invoice" onPress={() => router.push("/account")} style={{ alignSelf: "flex-start" }} />
              </Soft>
            ) : closed && cur.status === "sold" && userId && mine ? (
              <Soft testID="live-lost" style={{ gap: 6 }}>
                <T v="strong" style={{ fontSize: 19 }}>Sold to another bidder.</T>
                <T v="muted">Thanks for bidding. There's more coming up.</T>
              </Soft>
            ) : null}
            {note ? <Notice kind={note.kind} testID="live-note">{note.text}</Notice> : null}
            {bids.length ? (
              <View style={{ gap: 12 }} onLayout={(e) => { bidsAt.current = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height }; seenCheck(); }}>
                {bids.map((b, i) => (
                  <Button key={b} testID={i === 0 ? "live-bid" : undefined} kind={i === 0 ? "blue" : "soft"} disabled={busy || leading} busy={busy && i === 0}
                    title={`Bid ${money(b)}${f ? ` · ${allInMoney(priceBreakdown(b, f).total)} all-in` : ""}`} onPress={() => tap(b)} />
                ))}
              </View>
            ) : null}
            {open && !paused && userId && (leading || mineHere[cur.id]) ? <Button testID="live-withdraw" small kind="soft" title="Withdraw my bid" busy={busy} onPress={withdraw} /> : null}
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
                  {hasEstimate(l) ? <T v="small">Estimate {estimateText(l)}</T> : null}
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
        <T v="small" testID="live-rules">Only registered bidders (a verified mobile and ID) can bid. Each vehicle is sold under the hammer by Tyrebiter as agent for its owner: when the countdown ends, the highest bid buys it if it meets the reserve; if not, it's passed in and nobody owes anything. Each bid is binding unless you withdraw it before the hammer falls. The seller can't bid, and we never bid for the seller. The price and countdown here are what count; a video stream can run a few seconds behind. The auctioneer may also take bids by phone from registered bidders.</T>
      </Screen>

      <Sheet visible={ask != null} onClose={() => setAsk(null)} title={ask != null ? `Bid ${money(ask)}?` : ""} scroll testID="live-agree-sheet"
        footer={<>
          <Button testID="live-agree" title={ask != null ? `Bid ${money(ask)}` : "Bid"} busy={busy} disabled={!ack} onPress={() => { setAgreed(true); if (ask != null) void place(ask); }} />
          <Button kind="soft" title="Cancel" onPress={() => setAsk(null)} />
        </>}>
        {preview ? <View>
          <LineItem k="Your bid" v={money(preview.price)} />
          <LineItem k={feesLine(preview.transport)} v={money(preview.subtotal - preview.price, true)} />
          <LineItem k="All-in if you win at this bid" v={money(preview.total, true)} bold />
        </View> : null}
        <Soft style={{ padding: 14 }}>
          <Check testID="live-ack" checked={ack} onChange={setAck}>{`For this sale, each tap of a bid button is a bid, binding unless I withdraw it before the hammer falls. I understand vehicles are sold as is, where is: ${ACK_CHECK}. And ${ackPayLine(preview?.payMode || "transfer")}, under the terms of sale.`}</Check>
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
  dock: { position: "absolute", left: 0, right: 0, bottom: 0, gap: 8, paddingHorizontal: 16, paddingTop: 10, backgroundColor: C.bg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 16, shadowOffset: { width: 0, height: -6 }, elevation: 12 },
  dockTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  dockSecs: { fontFamily: F.heavy, fontSize: 17, color: C.ink, minWidth: 52, textAlign: "right", fontVariant: ["tabular-nums"] },
  dockRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  dockK: { fontFamily: F.semibold, fontSize: 14, color: C.muted },
  dockV: { fontFamily: F.heavy, fontSize: 19, color: C.ink, letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
  dockBtn: { minHeight: 56, borderRadius: 28, paddingHorizontal: 20, paddingVertical: 8, backgroundColor: C.blue, alignItems: "center", justifyContent: "center" },
  dockBtnText: { fontFamily: F.bold, fontSize: 17, color: "#FFFFFF" },
  dockBtnSmall: { fontFamily: F.semibold, fontSize: 12, color: "#FFFFFF", opacity: 0.85 },
  dockLead: { minHeight: 56, borderRadius: 28, paddingHorizontal: 18, backgroundColor: C.mint, alignItems: "center", justifyContent: "center" },
  dockLeadText: { fontFamily: F.heavy, fontSize: 16, color: C.ink },
  dockErr: { fontFamily: F.semibold, fontSize: 14, lineHeight: 19, color: C.urgent },
});
