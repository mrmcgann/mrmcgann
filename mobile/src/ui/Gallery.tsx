import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Modal, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { Image, type ImageStyle } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, VideoView, type VideoThumbnail } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppVideo, LotBundle } from "~/lib/types";
import { CarArt } from "./art";
import { Button, T } from "./kit";
import { C, F, PAD, backdrop } from "./theme";

const GAP = 6;
type Photo = LotBundle["photos"][number];
type Item = { kind: "photo"; p: Photo } | { kind: "video"; v: AppVideo };
const keyOf = (it: Item) => (it.kind === "photo" ? it.p.id : `video-${it.v.id}`);

/**
 * The listing's photos and video (the website's Gallery): up to 10 in total, one of them a video,
 * placed second. One big photo with four smaller tiles below, "Show all", and a full-screen viewer
 * you swipe through (the video plays in the same viewer).
 */
export function Gallery({ photos, videos, externalVideo, backdropKey, vehicleType, title }: {
  photos: Photo[]; videos: AppVideo[]; externalVideo: string | null | undefined; backdropKey: string | null | undefined; vehicleType: string | null | undefined; title: string;
}) {
  const { width } = useWindowDimensions();
  const [viewer, setViewer] = useState<number | null>(null);
  const video = videos[0] || null;
  const items = useMemo(() => {
    const list: Item[] = photos.map((p) => ({ kind: "photo", p }));
    if (video) list.splice(Math.min(1, list.length), 0, { kind: "video", v: video });
    return list;
  }, [photos, video]);
  const n = items.length;
  const videoAt = items.findIndex((x) => x.kind === "video");
  const inner = width - PAD * 2;
  const thumb = (inner - GAP * 3) / 4;
  const label = (k: number) => { const it = items[k]; return !it ? "" : it.kind === "video" ? "Video" : it.p.angle || `Photo ${k + 1}`; };
  const hasVideo = videoAt >= 0 || !!externalVideo;
  const playVideo = () => { if (videoAt >= 0) setViewer(videoAt); else if (externalVideo) void WebBrowser.openBrowserAsync(externalVideo); };
  const credits = [...new Set(photos.map((p) => p.credit).filter(Boolean))] as string[];
  const showAll = video ? `Show all (${photos.length} photo${photos.length === 1 ? "" : "s"} and video)` : `Show all photos (${n})`;
  const videoButton = hasVideo ? <Button testID="play-video" small kind="dark" title="▶ Play video" onPress={playVideo} /> : null;
  const first = items[0];

  return (
    <View style={{ paddingHorizontal: PAD, gap: GAP }}>
      {photos.length && first?.kind === "photo" ? (
        <>
          <Pressable testID="gallery-big" accessibilityRole="button" accessibilityLabel={`View ${label(0)}. ${photos.length} photo${photos.length === 1 ? "" : "s"}${video ? " and a video" : ""} of the ${title}`} onPress={() => setViewer(0)}>
            <Image source={{ uri: first.p.url }} style={[s.big, { height: inner * 0.75, backgroundColor: backdrop(backdropKey) }]} contentFit="cover" priority="high" transition={150} />
          </Pressable>
          {n > 1 ? (
            <View style={{ flexDirection: "row", gap: GAP }}>
              {items.slice(1, 5).map((it, i) => {
                const k = i + 1;
                const more = k === 4 && n > 5 ? n - 5 : 0;
                const size = { width: thumb, height: thumb };
                return it.kind === "video" ? (
                  <Pressable key={keyOf(it)} testID="gallery-video-tile" accessibilityRole="button" accessibilityLabel={`Play the video${more ? ` and ${more} more` : ""}`} onPress={() => setViewer(k)}>
                    <VideoFrame url={it.v.url} style={[s.thumb, size]} />
                    <View style={[s.tileCover, size]} pointerEvents="none">
                      <View style={s.badge}><Text style={s.badgeText}>▶</Text></View>
                      <Text style={s.vidLabel}>Video</Text>
                    </View>
                    {more ? <View style={[s.more, size]}><Text style={s.moreText}>+{more}</Text></View> : null}
                  </Pressable>
                ) : (
                  <Pressable key={keyOf(it)} testID={`gallery-thumb-${k}`} accessibilityRole="button" accessibilityLabel={`View ${label(k)}${more ? ` and ${more} more` : ""}`} onPress={() => setViewer(k)}>
                    <Image source={{ uri: it.p.url }} style={[s.thumb, size, { backgroundColor: backdrop(backdropKey) }]} contentFit="cover" transition={150} />
                    {more ? <View style={[s.more, size]}><Text style={s.moreText}>+{more}</Text></View> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={s.actions}>
            <Button testID="show-all-photos" small kind="soft" title={showAll} onPress={() => setViewer(0)} />
            {videoButton}
          </View>
          {credits.length ? <T v="small" style={{ textAlign: "right" }}>Photos: {credits.join(" · ")}</T> : null}
        </>
      ) : (
        <>
          <View style={[s.stage, { height: inner * 0.75, backgroundColor: backdrop(backdropKey) }]}>
            <CarArt type={vehicleType} width={inner * 0.78} />
            <Text style={s.ph}>Photos to come</Text>
          </View>
          {videoButton ? <View style={s.actions}>{videoButton}</View> : null}
        </>
      )}
      {viewer != null && items[viewer] ? <MediaViewer items={items} start={viewer} onClose={() => setViewer(null)} /> : null}
    </View>
  );
}

/** A still from the video for its tile (iOS and Android). Until there is one, or on the web build, a dark tile. */
function VideoFrame({ url, style }: { url: string; style: StyleProp<ViewStyle> }) {
  const native = Platform.OS !== "web";
  const player = useVideoPlayer(native ? url : null, (p) => { p.muted = true; });
  const [frame, setFrame] = useState<VideoThumbnail | null>(null);
  useEffect(() => {
    if (!native) return;
    let live = true;
    player.generateThumbnailsAsync(0.5, { maxWidth: 400 }).then((t) => { if (live && t[0]) setFrame(t[0]); }).catch(() => undefined);
    return () => { live = false; };
  }, [player, native]);
  return frame
    ? <Image source={frame} style={[style as StyleProp<ImageStyle>, { backgroundColor: C.ink }]} contentFit="cover" accessibilityIgnoresInvertColors />
    : <View style={[style, { backgroundColor: C.ink }]} />;
}

/** Full-screen photos and video: black background, swipe left and right, "3 of 12", the photo's credit. */
function MediaViewer({ items, start, onClose }: { items: Item[]; start: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(start);
  const list = useRef<FlatList<Item>>(null);
  const cur = items[i];
  const stage = height - insets.top - insets.bottom - 120;
  const caption = cur?.kind === "photo" ? [cur.p.angle, cur.p.credit ? `Photo: ${cur.p.credit}` : null].filter(Boolean).join(" · ") : cur?.v.title || "";
  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={["portrait"]}>
      <StatusBar style="light" />
      <View style={s.dark} accessibilityViewIsModal testID="photo-viewer">
        <FlatList ref={list} data={items} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={keyOf}
          initialScrollIndex={start} getItemLayout={(_, k) => ({ length: width, offset: width * k, index: k })}
          scrollEventThrottle={32} onScroll={(e) => { const k = Math.round(e.nativeEvent.contentOffset.x / width); if (k !== i && k >= 0 && k < items.length) setI(k); }}
          renderItem={({ item, index }) => (
            <View style={{ width, height, justifyContent: "center" }}>
              {item.kind === "video"
                ? <Player url={item.v.url} title={item.v.title} active={index === i} width={width} height={stage} />
                : <Image source={{ uri: item.p.url }} style={{ width, height: stage }} contentFit="contain" accessibilityLabel={item.p.angle || `Photo ${index + 1}`} />}
            </View>
          )} />
        <View style={[s.top, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Text style={s.count} accessibilityLiveRegion="polite">{cur?.kind === "video" ? "Video · " : ""}{i + 1} of {items.length}</Text>
          <Pressable testID="photo-viewer-close" accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={s.close}><Text style={s.closeText}>✕</Text></Pressable>
        </View>
        {caption && cur?.kind === "photo" ? <Text style={[s.caption, { bottom: insets.bottom + 24 }]} numberOfLines={2}>{caption}</Text> : null}
        {caption && cur?.kind === "video" ? <Text style={[s.caption, { top: insets.top + 56 }]} numberOfLines={1}>{caption}</Text> : null}
      </View>
    </Modal>
  );
}

/** The listing video. It plays while its page is showing and pauses when you swipe to a photo. */
function Player({ url, title, active, width, height }: { url: string; title: string; active: boolean; width: number; height: number }) {
  const player = useVideoPlayer(url);
  useEffect(() => { if (active) player.play(); else player.pause(); }, [active, player]);
  return (
    <View testID="viewer-video" style={{ width, height }}>
      <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls surfaceType="textureView" accessibilityLabel={`${title} video`} />
    </View>
  );
}

const s = StyleSheet.create({
  big: { width: "100%", borderRadius: 22 },
  thumb: { borderRadius: 14, overflow: "hidden" },
  tileCover: { position: "absolute", left: 0, top: 0, alignItems: "center", justifyContent: "center" },
  badge: { width: 34, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center", paddingLeft: 3 },
  badgeText: { fontFamily: F.heavy, fontSize: 13, color: C.ink },
  vidLabel: { position: "absolute", left: 6, bottom: 6, overflow: "hidden", borderRadius: 9, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: "rgba(29,29,31,0.72)", color: "#FFFFFF", fontFamily: F.bold, fontSize: 10.5 },
  more: { position: "absolute", left: 0, top: 0, borderRadius: 14, backgroundColor: "rgba(29,29,31,0.55)", alignItems: "center", justifyContent: "center" },
  moreText: { color: "#FFFFFF", fontFamily: F.heavy, fontSize: 20, letterSpacing: -0.4 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  stage: { borderRadius: 22, alignItems: "center", justifyContent: "flex-end", paddingBottom: 44, overflow: "hidden" },
  ph: { position: "absolute", bottom: 14, fontFamily: F.bold, fontSize: 13, color: "rgba(29,29,31,0.6)" },
  dark: { flex: 1, backgroundColor: "#000000" },
  top: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  count: { flex: 1, color: "#FFFFFF", fontFamily: F.bold, fontSize: 15 },
  close: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center" },
  closeText: { color: "#FFFFFF", fontFamily: F.bold, fontSize: 18 },
  caption: { position: "absolute", left: 20, right: 20, textAlign: "center", color: "rgba(255,255,255,0.8)", fontFamily: F.medium, fontSize: 14, lineHeight: 20 },
});
