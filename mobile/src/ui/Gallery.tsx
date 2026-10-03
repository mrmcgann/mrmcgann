import { useRef, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { StatusBar } from "expo-status-bar";
import { useVideoPlayer, VideoView } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { AppVideo, LotBundle } from "~/lib/types";
import { CarArt } from "./art";
import { Button, T } from "./kit";
import { C, F, PAD, backdrop } from "./theme";

const GAP = 6;
type Photo = LotBundle["photos"][number];

/**
 * The listing's photos (the website's Gallery): one big photo with four smaller ones below,
 * "Show all photos", approved videos, and a full-screen viewer you can swipe through.
 */
export function Gallery({ photos, videos, externalVideo, backdropKey, vehicleType, title }: {
  photos: Photo[]; videos: AppVideo[]; externalVideo: string | null | undefined; backdropKey: string | null | undefined; vehicleType: string | null | undefined; title: string;
}) {
  const { width } = useWindowDimensions();
  const [viewer, setViewer] = useState<number | null>(null);
  const [playing, setPlaying] = useState<number | null>(null);
  const n = photos.length;
  const inner = width - PAD * 2;
  const thumb = (inner - GAP * 3) / 4;
  const label = (k: number) => photos[k]?.angle || `Photo ${k + 1}`;
  const hasVideo = videos.length > 0 || !!externalVideo;
  const playVideo = () => { if (videos.length) setPlaying(0); else if (externalVideo) void WebBrowser.openBrowserAsync(externalVideo); };
  const credits = [...new Set(photos.map((p) => p.credit).filter(Boolean))] as string[];
  const videoButton = hasVideo ? (
    <Button testID="play-video" small kind="dark" title={`▶ Play video${videos.length > 1 ? `s (${videos.length})` : ""}`} onPress={playVideo} />
  ) : null;

  return (
    <View style={{ paddingHorizontal: PAD, gap: GAP }}>
      {n ? (
        <>
          <Pressable testID="gallery-big" accessibilityRole="button" accessibilityLabel={`View ${label(0)}. ${n} photo${n === 1 ? "" : "s"} of the ${title}`} onPress={() => setViewer(0)}>
            <Image source={{ uri: photos[0].url }} style={[s.big, { height: inner * 0.75, backgroundColor: backdrop(backdropKey) }]} contentFit="cover" priority="high" transition={150} />
          </Pressable>
          {n > 1 ? (
            <View style={{ flexDirection: "row", gap: GAP }}>
              {photos.slice(1, 5).map((p, i) => {
                const k = i + 1;
                const more = k === 4 && n > 5 ? n - 5 : 0;
                return (
                  <Pressable key={p.id} testID={`gallery-thumb-${k}`} accessibilityRole="button" accessibilityLabel={`View ${label(k)}${more ? ` and ${more} more photos` : ""}`} onPress={() => setViewer(k)}>
                    <Image source={{ uri: p.url }} style={[s.thumb, { width: thumb, height: thumb, backgroundColor: backdrop(backdropKey) }]} contentFit="cover" transition={150} />
                    {more ? <View style={[s.more, { width: thumb, height: thumb }]}><Text style={s.moreText}>+{more}</Text></View> : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <View style={s.actions}>
            <Button testID="show-all-photos" small kind="soft" title={`Show all photos (${n})`} onPress={() => setViewer(0)} />
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
      {viewer != null ? <PhotoViewer photos={photos} start={viewer} onClose={() => setViewer(null)} /> : null}
      {playing != null && videos[playing] ? <VideoViewer videos={videos} index={playing} onPick={setPlaying} onClose={() => setPlaying(null)} /> : null}
    </View>
  );
}

/** Full-screen photos: black background, swipe left and right, "3 of 12", the photo's credit. */
function PhotoViewer({ photos, start, onClose }: { photos: Photo[]; start: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [i, setI] = useState(start);
  const list = useRef<FlatList<Photo>>(null);
  const p = photos[i];
  const caption = [p?.angle, p?.credit ? `Photo: ${p.credit}` : null].filter(Boolean).join(" · ");
  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent supportedOrientations={["portrait"]}>
      <StatusBar style="light" />
      <View style={s.dark} accessibilityViewIsModal testID="photo-viewer">
        <FlatList ref={list} data={photos} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(x) => x.id}
          initialScrollIndex={start} getItemLayout={(_, k) => ({ length: width, offset: width * k, index: k })}
          scrollEventThrottle={32} onScroll={(e) => { const k = Math.round(e.nativeEvent.contentOffset.x / width); if (k !== i && k >= 0 && k < photos.length) setI(k); }}
          renderItem={({ item, index }) => (
            <View style={{ width, height, justifyContent: "center" }}>
              <Image source={{ uri: item.url }} style={{ width, height: height - insets.top - insets.bottom - 120 }} contentFit="contain" accessibilityLabel={item.angle || `Photo ${index + 1}`} />
            </View>
          )} />
        <View style={[s.top, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Text style={s.count} accessibilityLiveRegion="polite">{i + 1} of {photos.length}</Text>
          <Pressable testID="photo-viewer-close" accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={s.close}><Text style={s.closeText}>✕</Text></Pressable>
        </View>
        {caption ? <Text style={[s.caption, { bottom: insets.bottom + 24 }]} numberOfLines={2}>{caption}</Text> : null}
      </View>
    </Modal>
  );
}

/** Full-screen video player for approved listing videos. */
function VideoViewer({ videos, index, onPick, onClose }: { videos: AppVideo[]; index: number; onPick: (i: number) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const v = videos[index];
  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar style="light" />
      <View style={[s.dark, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 16 }]} accessibilityViewIsModal testID="video-viewer">
        <Player key={v.id} url={v.url} title={v.title} />
        {videos.length > 1 ? (
          <View style={s.vids}>
            {videos.map((x, k) => (
              <Pressable key={x.id} accessibilityRole="button" accessibilityState={{ selected: k === index }} onPress={() => onPick(k)} style={[s.vid, k === index && { backgroundColor: "#FFFFFF" }]}>
                <Text style={[s.vidText, k === index && { color: C.ink }]}>▶ {x.title}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        <View style={[s.top, { top: insets.top + 8 }]} pointerEvents="box-none">
          <Text style={s.count} numberOfLines={1}>{v.title}{videos.length > 1 ? ` · video ${index + 1} of ${videos.length}` : ""}</Text>
          <Pressable testID="video-viewer-close" accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={onClose} style={s.close}><Text style={s.closeText}>✕</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

function Player({ url, title }: { url: string; title: string }) {
  const player = useVideoPlayer(url, (p) => { p.play(); });
  return <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls accessibilityLabel={`${title} video`} />;
}

const s = StyleSheet.create({
  big: { width: "100%", borderRadius: 22 },
  thumb: { borderRadius: 14 },
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
  vids: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", paddingTop: 14, paddingHorizontal: 16 },
  vid: { height: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.16)" },
  vidText: { color: "#FFFFFF", fontFamily: F.bold, fontSize: 14 },
});
