import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { countdown, dayShort, money } from "@/lib/format";
import { lotFees, priceBreakdown } from "@/lib/fees";
import { allInMoney, estimateAllInText, estimateText, hasEstimate } from "@/lib/estimate";
import { premiumLabel } from "@/lib/transport";
import { useSession } from "~/lib/session";
import { CAT, specLine } from "@/lib/vehicles";
import type { AppLot } from "~/lib/types";
import { photoUrl } from "~/lib/env";
import { CarArt, Icon } from "./art";
import { Tag, T, useNow } from "./kit";
import { C, F, backdrop } from "./theme";

export const shownPrice = (l: Pick<AppLot, "status" | "sold_price" | "current_bid" | "start_price" | "bid_count">) =>
  l.status === "sold" ? l.sold_price : l.bid_count > 0 ? l.current_bid : Math.max(Number(l.current_bid) || 0, Number(l.start_price) || 0);

function TimeChip({ lot }: { lot: AppLot }) {
  const live = lot.status === "live";
  const now = useNow(live);
  const label = live ? (lot.live_state === "waiting" ? `Live auction · ${dayShort(lot.ends_at)}` : lot.live_state === "open" ? "Up now, live" : (lot.method === "tender" ? "Tender · " : "") + countdown(new Date(lot.ends_at || 0).getTime() - now)) : lot.status === "sold" ? "Sold" : lot.status === "offers" ? "Make an offer" : lot.status === "referred" ? "Under offer" : lot.status === "passed" ? "Passed in" : "Ended";
  const soon = live && (lot.live_state === "open" || (!lot.live_state && new Date(lot.ends_at || 0).getTime() - now < 300000));
  return <View style={[s.time, soon && { backgroundColor: C.urgent }]}><Text style={[s.timeText, soon && { color: "#FFFFFF" }]}>{label}</Text></View>;
}

/** A vehicle in a list: photo (or silhouette) on its colour, when it's offered, watch heart, and the estimate or bid
 *  with its all-in amount in the same size, the buyer's premium and whether there's a statutory warranty. */
export const LotCard = memo(function LotCard({ lot, watched, onWatch, compact }: { lot: AppLot; watched?: boolean; onWatch?: (id: number) => void; compact?: boolean }) {
  const cover = lot.cover_url || photoUrl(lot.cover_path);
  const price = shownPrice(lot);
  const { config } = useSession();
  const fees = config?.fees ? lotFees(config.fees, lot) : null;
  const upNow = lot.status === "live" && lot.live_state === "open";
  const showEstimate = hasEstimate(lot) && lot.status !== "sold" && !upNow;
  const tender = lot.method === "tender" && lot.status === "live";
  const terms = [lot.status !== "sold" && fees ? premiumLabel(fees) : null, lot.statutory_warranty === false ? "No statutory warranty" : lot.statutory_warranty ? "Statutory warranty applies" : null].filter(Boolean).join(" · ");
  const open = () => router.push(`/lot/${lot.id}`);
  return (
    <Pressable testID={`lot-${lot.id}`} accessibilityRole="button" accessibilityLabel={`${lot.title}, ${lot.bid_count ? "current bid" : "starting at"} ${money(price)}`} onPress={open} style={{ gap: 12 }}>
      <View style={[s.stage, { backgroundColor: backdrop(lot.backdrop), height: compact ? 170 : 220 }]}>
        {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessibilityIgnoresInvertColors /> : (
          <View style={s.art}><CarArt type={lot.vehicle_type || CAT[lot.category]?.silhouette} width={compact ? 210 : 260} /></View>
        )}
        <View style={s.topRow}>
          <TimeChip lot={lot} />
          {onWatch ? (
            <Pressable testID={`watch-${lot.id}`} accessibilityRole="button" accessibilityLabel={watched ? "Remove from watchlist" : "Add to watchlist"} hitSlop={8} onPress={() => onWatch(lot.id)} style={s.heart}>
              <Icon name={watched ? "heartOn" : "heart"} size={20} />
            </Pressable>
          ) : null}
        </View>
        <View style={s.bottomRow}>
          {lot.visual_grade ? <Tag label={`Grade ${lot.visual_grade}`} color="rgba(255,255,255,0.92)" /> : <View />}
          {lot.method === "tender" && lot.status === "live" ? <Tag label={`${lot.tender_count || 0} tender${lot.tender_count === 1 ? "" : "s"}`} color={C.lilac} /> : lot.status === "live" && lot.has_reserve && !lot.reserve_met && lot.bid_count > 0 ? <Tag label="Reserve not met" color={C.sun} /> : lot.status === "live" && !lot.has_reserve ? <Tag label="No reserve" color={C.mint} /> : null}
        </View>
      </View>
      <View style={{ gap: 3, paddingHorizontal: 4 }}>
        <T v="eyebrow">{[lot.suburb, lot.state].filter(Boolean).join(" ")}</T>
        <T v="title" numberOfLines={2} style={{ fontSize: compact ? 17 : 19, lineHeight: compact ? 21 : 23 }}>{lot.title}</T>
        <T v="small" numberOfLines={1}>{[specLine(lot) || [lot.year, lot.make].filter(Boolean).join(" "), lot.registration === "unregistered" ? "Unregistered" : null].filter(Boolean).join(" · ")}</T>
        {tender ? (
          <View style={s.row}><Text style={s.price}>{`From ${money(lot.start_price)}`}</Text><T v="small">Sealed tender</T></View>
        ) : showEstimate ? (
          <View testID={`card-estimate-${lot.id}`}>
            <View style={s.row}><T v="small">Estimate</T><Text style={s.price2}>{estimateText(lot)}</Text></View>
            {fees ? <View style={s.row}><T v="small">All-in</T><Text style={s.price2}>{estimateAllInText(lot, fees)}</Text></View> : null}
          </View>
        ) : (
          <View>
            <View style={s.row}><T v="small">{lot.status === "sold" ? "Sold for" : lot.bid_count ? "Current bid" : "Opening bid"}</T><Text style={s.price2}>{money(price)}</Text></View>
            {fees && lot.status !== "sold" ? <View style={s.row}><T v="small">All-in</T><Text style={s.price2}>{allInMoney(priceBreakdown(Number(price) || 0, fees).total)}</Text></View> : null}
          </View>
        )}
        {!tender && lot.status !== "sold" ? <T v="small">{lot.bid_count ? `${lot.bid_count} ${lot.live_state === "waiting" ? "early " : ""}bid${lot.bid_count === 1 ? "" : "s"}` : lot.live_state === "waiting" ? "Leave an early bid" : "No bids yet"}</T> : null}
        {terms ? <T v="small" style={{ fontSize: 12, lineHeight: 16 }}>{terms}</T> : null}
      </View>
    </Pressable>
  );
});

const s = StyleSheet.create({
  stage: { borderRadius: 26, overflow: "hidden", justifyContent: "flex-end" },
  art: { position: "absolute", left: 0, right: 0, bottom: 36, alignItems: "center" },
  topRow: { position: "absolute", top: 12, left: 12, right: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bottomRow: { position: "absolute", bottom: 12, left: 12, right: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  time: { height: 30, borderRadius: 15, paddingHorizontal: 12, backgroundColor: "#FFFFFF", justifyContent: "center" },
  timeText: { fontFamily: F.heavy, fontSize: 13, color: C.ink, fontVariant: ["tabular-nums"] },
  heart: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  price: { fontFamily: F.heavy, fontSize: 24, letterSpacing: -0.6, color: C.ink },
  price2: { fontFamily: F.heavy, fontSize: 18, letterSpacing: -0.4, color: C.ink, fontVariant: ["tabular-nums"] },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 2, gap: 10 },
});
