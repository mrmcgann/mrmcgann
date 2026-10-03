import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { countdown, money } from "@/lib/format";
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
  const label = live ? countdown(new Date(lot.ends_at || 0).getTime() - now) : lot.status === "sold" ? "Sold" : lot.status === "offers" ? "Make an offer" : lot.status === "referred" ? "Under offer" : "Ended";
  const soon = live && new Date(lot.ends_at || 0).getTime() - now < 300000;
  return <View style={[s.time, soon && { backgroundColor: C.urgent }]}><Text style={[s.timeText, soon && { color: "#FFFFFF" }]}>{label}</Text></View>;
}

/** A vehicle in a list: photo (or silhouette) on its colour, countdown, watch heart, price. */
export const LotCard = memo(function LotCard({ lot, watched, onWatch, compact }: { lot: AppLot; watched?: boolean; onWatch?: (id: number) => void; compact?: boolean }) {
  const cover = lot.cover_url || photoUrl(lot.cover_path);
  const price = shownPrice(lot);
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
          {lot.status === "live" && lot.has_reserve && !lot.reserve_met ? <Tag label="Reserve not met" color={C.sun} /> : lot.status === "live" && !lot.has_reserve ? <Tag label="No reserve" color={C.mint} /> : null}
        </View>
      </View>
      <View style={{ gap: 3, paddingHorizontal: 4 }}>
        <T v="eyebrow">{[lot.suburb, lot.state].filter(Boolean).join(" ")}</T>
        <T v="title" numberOfLines={2} style={{ fontSize: compact ? 17 : 19, lineHeight: compact ? 21 : 23 }}>{lot.title}</T>
        <T v="small" numberOfLines={1}>{specLine(lot) || [lot.year, lot.make].filter(Boolean).join(" ")}</T>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", marginTop: 4 }}>
          <Text style={s.price}>{money(price)}</Text>
          <T v="small">{lot.status === "live" && lot.bid_count === 0 ? "Starting bid" : `${lot.bid_count} bid${lot.bid_count === 1 ? "" : "s"}`}</T>
        </View>
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
});
