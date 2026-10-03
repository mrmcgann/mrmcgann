import { useCallback, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { countdown, money } from "@/lib/format";
import { toQueryString, type SearchFilters } from "@/lib/search";
import { CAT } from "@/lib/vehicles";
import { api, errText } from "~/lib/api";
import { photoUrl } from "~/lib/env";
import { supabase } from "~/lib/supabase";
import { useSession } from "~/lib/session";
import type { AppLot } from "~/lib/types";
import { Button, Empty, Loading, Notice, Screen, Segmented, Soft, T, Tag, useNow } from "~/ui/kit";
import { CarArt } from "~/ui/art";
import { shownPrice } from "~/ui/LotCard";
import { C, F, backdrop } from "~/ui/theme";

type Row = { lot_id: number; remind: boolean; lots: AppLot };
type Saved = { id: string; label: string; query: SearchFilters; created_at: string };
type Status = { k: string; t: string; c: string };
type Filter = "all" | "winning" | "outbid" | "won" | "ended";

export default function Watchlist() {
  const insets = useSafeAreaInsets();
  const { signedIn, me, toggleWatch } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [maxes, setMaxes] = useState<Map<number, number>>(new Map());
  const [searches, setSearches] = useState<Saved[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [err, setErr] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const uid = me?.user?.id;

  // Same queries as the website's watchlist page; row level security keeps them to this member.
  const load = useCallback(async () => {
    if (!uid) return;
    const [w, m, ss] = await Promise.all([
      supabase.from("watchlist").select("lot_id, remind, lots(*)").eq("user_id", uid).order("created_at", { ascending: false }).limit(500),
      supabase.from("max_bids").select("lot_id, max_amount, lots(*)").eq("bidder_id", uid).order("updated_at", { ascending: false }).limit(300),
      supabase.from("saved_searches").select("id, label, query, created_at").eq("user_id", uid).order("created_at", { ascending: false }),
    ]);
    if (w.error || m.error) { setErr("We couldn't load your watchlist. Pull down to try again."); return; }
    const mx = new Map<number, number>(((m.data || []) as unknown as { lot_id: number; max_amount: number }[]).map((x) => [x.lot_id, Number(x.max_amount)]));
    const all = ((w.data || []) as unknown as Row[]).filter((r) => r.lots);
    const seen = new Set(all.map((r) => r.lot_id));
    for (const x of (m.data || []) as unknown as { lot_id: number; lots: AppLot }[]) if (x.lots && !seen.has(x.lot_id)) all.push({ lot_id: x.lot_id, remind: false, lots: x.lots });
    all.sort((a, b) => new Date(a.lots.ends_at || 0).getTime() - new Date(b.lots.ends_at || 0).getTime());
    setMaxes(mx); setRows(all); setSearches((ss.data || []) as Saved[]); setErr("");
  }, [uid]);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (!signedIn) {
    return (
      <Screen contentStyle={{ paddingTop: insets.top + 20 }}>
        <T v="d2">Watchlist.</T>
        <Empty title="Keep an eye on vehicles." sub="Tap the heart on any vehicle to watch it. We'll remind you before it ends, and everything you bid on shows here.">
          <Button title="Join free" onPress={() => router.push("/join?next=/watchlist")} />
          <Button kind="soft" title="Sign in" onPress={() => router.push("/signin?next=/watchlist")} />
        </Empty>
      </Screen>
    );
  }

  const status = (l: AppLot): Status => {
    const mx = maxes.get(l.id);
    if (l.status === "sold") return l.winner_id === uid ? { k: "won", t: "Won", c: C.mint } : { k: "ended", t: mx != null ? "Didn't win" : "Sold", c: C.panel2 };
    if (l.status === "referred") return l.leader_id === uid ? { k: "winning", t: "With the seller", c: C.sun } : { k: "ended", t: "Referred", c: C.panel2 };
    if (l.status === "offers") return { k: "ended", t: "Make an offer open", c: C.sun };
    if (l.status !== "live") return { k: "ended", t: "Ended", c: C.panel2 };
    if (mx == null) return { k: "watch", t: "Not bid yet", c: C.panel };
    return l.leader_id === uid ? { k: "winning", t: `Winning · max ${money(mx)}`, c: C.mint } : { k: "outbid", t: `Outbid · max ${money(mx)}`, c: C.berry };
  };
  const list = (rows || []).filter((r) => filter === "all" || status(r.lots).k === filter);

  return (
    <Screen refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} contentStyle={{ paddingTop: insets.top + 20 }} testID="watchlist">
      <T v="d2">Watchlist.</T>
      <Segmented options={[["all", "All"], ["winning", "Winning"], ["outbid", "Outbid"], ["won", "Won"], ["ended", "Ended"]]} value={filter} onChange={setFilter} />
      {err ? <Notice kind="bad">{err}</Notice> : null}
      {!rows ? <Loading /> : list.length === 0 ? (
        <Empty title={filter === "all" ? "Your watchlist is empty." : "Nothing here right now."} sub="Tap the heart on any vehicle to keep an eye on it. Anything you bid on is added automatically.">
          <Button title="Browse auctions" onPress={() => router.push("/search")} />
        </Empty>
      ) : list.map((r) => (
        <WatchRow key={r.lot_id} row={r} st={status(r.lots)} onRemind={async (v) => {
          setRows((cur) => cur?.map((x) => (x.lot_id === r.lot_id ? { ...x, remind: v } : x)) || null);
          await api("/api/watch", { body: { lotId: r.lot_id, remind: v } }).catch(() => undefined);
        }} onRemove={async () => { await toggleWatch(r.lot_id); void load(); }} watchedRow={!maxes.has(r.lot_id)} />
      ))}

      <View style={{ gap: 12, marginTop: 12 }}>
        <T v="d3">Saved searches.</T>
        <T v="muted">We'll alert you when a new vehicle matches. Change how in Account › Alerts.</T>
        {searches.length === 0 ? <Soft><T v="muted">Search for anything and tap “Save search”.</T></Soft> : searches.map((s2, i) => (
          <Pressable key={s2.id} accessibilityRole="button" onPress={() => router.push(`/search?${toQueryString(s2.query || {})}`)} style={[st.saved, { backgroundColor: [C.sun, C.sky, C.lime, C.berry, C.mint, C.lilac][i % 6] }]}>
            <Text style={st.savedLabel}>{s2.label}</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={st.savedRun}>See matches ›</Text>
              <Text accessibilityRole="button" onPress={async () => {
                try { await api("/api/saved-searches", { method: "DELETE", body: { id: s2.id } }); setSearches((x) => x.filter((y) => y.id !== s2.id)); }
                catch (e) { setErr(errText(e)); }
              }} style={st.savedDel}>Delete</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

function WatchRow({ row, st: status, onRemind, onRemove, watchedRow }: { row: Row; st: Status; onRemind: (v: boolean) => void; onRemove: () => void; watchedRow: boolean }) {
  const l = row.lots;
  const live = l.status === "live";
  const now = useNow(live);
  const left = new Date(l.ends_at || 0).getTime() - now;
  const cover = photoUrl(l.cover_path);
  return (
    <View style={st.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={l.title} onPress={() => router.push(`/lot/${l.id}`)} style={{ flexDirection: "row", gap: 14 }}>
        <View style={[st.thumb, { backgroundColor: backdrop(l.backdrop) }]}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <CarArt type={l.vehicle_type || CAT[l.category]?.silhouette} width={100} />}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <T v="title" numberOfLines={2}>{l.title}</T>
          <Text style={st.price}>{money(shownPrice(l))}</Text>
          <Tag label={status.t} color={status.c} />
        </View>
      </Pressable>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <Text style={[st.when, live && left < 3600000 ? { color: C.urgent } : null]}>{live ? `Ends in ${countdown(left)}` : l.status === "sold" ? "Sold" : "Closed"}</Text>
        {live ? <Button small kind={status.k === "watch" ? "soft" : "blue"} title={status.k === "outbid" ? "Bid again" : status.k === "winning" ? "Raise max" : "Bid"} onPress={() => router.push(`/lot/${l.id}`)} /> : null}
      </View>
      {watchedRow && live ? (
        <View style={st.remind}>
          <T v="small" style={{ flex: 1 }}>Remind me before it ends</T>
          <Switch value={row.remind} onValueChange={onRemind} trackColor={{ true: C.blue, false: C.panel2 }} accessibilityLabel="Remind me before it ends" />
          <Text accessibilityRole="button" onPress={onRemove} style={st.remove}>Remove</Text>
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  row: { borderRadius: 24, borderWidth: 1, borderColor: C.line, padding: 14, gap: 12 },
  thumb: { width: 112, height: 84, borderRadius: 16, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  price: { fontFamily: F.heavy, fontSize: 20, letterSpacing: -0.4, color: C.ink },
  when: { fontFamily: F.bold, fontSize: 14, color: C.ink2, fontVariant: ["tabular-nums"] },
  remind: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, paddingTop: 10 },
  remove: { fontFamily: F.bold, fontSize: 14, color: C.muted },
  saved: { borderRadius: 22, padding: 18, gap: 10 },
  savedLabel: { fontFamily: F.heavy, fontSize: 18, letterSpacing: -0.3, color: C.ink },
  savedRun: { fontFamily: F.bold, fontSize: 14, color: C.ink },
  savedDel: { fontFamily: F.bold, fontSize: 14, color: C.ink, opacity: 0.7 },
});
