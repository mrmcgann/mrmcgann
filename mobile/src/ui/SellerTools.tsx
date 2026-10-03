import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { dateTime, money } from "@/lib/format";
import { VIDEO_MAX, VIDEO_STATUS, VIDEO_TYPES } from "@/lib/videos";
import { api, errText } from "~/lib/api";
import { pickVideo, uploadVideo } from "~/lib/files";
import type { SellerBid, SellerVideo } from "~/lib/types";
import { AutoTag, BlurName } from "./BlurName";
import { Button, Notice, Select, Sheet, T } from "./kit";
import { C, F } from "./theme";

/** Bids on the seller's own vehicle, newest first, with bidder names blurred. */
export function SellerBids({ bids, startOpen }: { bids: SellerBid[]; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  if (!bids.length) return null;
  return (
    <View style={s.box}>
      <Pressable testID="seller-bids" accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`Bids (${bids.length}). ${open ? "Hide" : "Show"}`}
        onPress={() => setOpen(!open)} style={s.head}>
        <T v="strong">Bids ({bids.length})</T>
        <Text style={[s.caret, open && { transform: [{ rotate: "180deg" }] }]}>⌄</Text>
      </Pressable>
      {open ? (
        <View style={{ paddingBottom: 10 }}>
          {bids.slice(0, 50).map((b, k) => (
            <View key={`${b.created_at}-${k}`} style={s.bid}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", marginLeft: -4 }}>
                <BlurName mask={b.bidder_mask} style={{ flexShrink: 1, fontSize: 15 }} />{b.is_auto ? <AutoTag /> : null}
              </View>
              <T v="strong" style={{ fontVariant: ["tabular-nums"] }}>{money(b.amount)}</T>
              <T v="small" style={{ width: 118, textAlign: "right" }}>{dateTime(b.created_at)}</T>
            </View>
          ))}
          <T v="small" style={{ marginTop: 8 }}>Bidder names are hidden. Every bidder has verified their mobile, card and ID.</T>
        </View>
      ) : null}
    </View>
  );
}

const TITLES: [string, string][] = ["Walkaround", "Cold start", "Engine running", "Interior", "Underbody", "Features"].map((t) => [t, t]);

/** The seller adds a video to their listing. It uploads privately and stays hidden until our team approves it. */
export function SellerVideos({ lotId, videos, canAdd, onChange }: { lotId: number; videos: SellerVideo[]; canAdd: boolean; onChange: () => void }) {
  const [title, setTitle] = useState(TITLES[0][0]);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [removing, setRemoving] = useState<SellerVideo | null>(null);
  const [busy, setBusy] = useState(false);
  const live = videos.filter((v) => v.status !== "removed");
  const room = live.filter((v) => v.status === "pending" || v.status === "approved").length < 3;

  async function add() {
    setMsg(null);
    let picked: Awaited<ReturnType<typeof pickVideo>>;
    try { picked = await pickVideo(); } catch (e) { setMsg({ ok: false, text: errText(e) }); return; }
    if (!picked) return;
    if (!VIDEO_TYPES[picked.type]) return setMsg({ ok: false, text: "Use an MP4, MOV or WebM video." });
    if (!picked.size) return setMsg({ ok: false, text: "Couldn't read that video. Try another one." });
    if (picked.size > VIDEO_MAX) return setMsg({ ok: false, text: "Videos can be up to 250 MB. Trim it, or record at 1080p rather than 4K." });
    setProgress(0);
    try {
      const u = await api<{ path: string; signedUrl: string; token: string }>("/api/videos/upload-url", { body: { lotId, size: picked.size, mime: picked.type } });
      await uploadVideo(u.signedUrl, picked, setProgress);
      await api("/api/videos", { body: { lotId, path: u.path, title, size: picked.size, mime: picked.type } });
      setMsg({ ok: true, text: "Uploaded. We review every video before it appears on your listing, usually within one business day." });
      onChange();
    } catch (e) { setMsg({ ok: false, text: errText(e) }); }
    setProgress(null);
  }

  async function remove() {
    if (!removing) return;
    setBusy(true);
    try { await api(`/api/videos/${removing.id}`, { method: "DELETE" }); setRemoving(null); onChange(); }
    catch (e) { setRemoving(null); setMsg({ ok: false, text: errText(e) }); }
    setBusy(false);
  }

  return (
    <View style={{ gap: 10 }}>
      <T v="strong">Videos</T>
      {live.length === 0 ? <T v="muted">Listings with a walkaround video attract more bidders. Film in landscape, in daylight, for 1 to 3 minutes.</T> : null}
      {live.map((v) => (
        <View key={v.id} style={s.video}>
          <View style={{ flex: 1 }}>
            <T v="strong">{v.title}</T>
            <T v="small" style={v.status === "rejected" ? { color: C.badInk } : undefined}>{VIDEO_STATUS[v.status] || v.status}{v.status === "rejected" && v.review_note ? `: ${v.review_note}` : ""}</T>
          </View>
          {v.status !== "rejected" ? <Text testID="remove-video" accessibilityRole="button" accessibilityLabel={`Remove the ${v.title} video`} onPress={() => setRemoving(v)} style={s.remove}>Remove</Text> : null}
        </View>
      ))}
      {canAdd && room ? (
        <View style={{ gap: 10 }}>
          <Select label="What the video shows" value={title} options={TITLES} placeholder="Walkaround" onChange={(v) => setTitle(v || TITLES[0][0])} />
          <Button testID="add-video" small kind="dark" title={progress != null ? `Uploading ${progress}%` : "Add a video"} disabled={progress != null} onPress={add} style={{ alignSelf: "flex-start" }} />
        </View>
      ) : null}
      {progress != null ? (
        <View style={s.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress }}>
          <View style={[s.fill, { width: `${progress}%` }]} />
        </View>
      ) : null}
      {msg ? <Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice> : null}
      <T v="small">Up to 3 videos, 250 MB each (MP4, MOV or WebM). Every video is checked by our team before it goes live. No number plates of other vehicles, people's faces or contact details, please.</T>
      <Sheet visible={!!removing} onClose={() => setRemoving(null)} title="Remove this video?"
        footer={<><Button title="Remove video" kind="danger" busy={busy} onPress={remove} /><Button kind="soft" title="Cancel" onPress={() => setRemoving(null)} /></>}>
        <T v="muted">{removing?.status === "approved" ? "It comes off your listing straight away." : "It won't be reviewed or shown on your listing."}</T>
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  box: { borderRadius: 18, backgroundColor: C.panel, paddingHorizontal: 14, paddingVertical: 4 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 44 },
  caret: { fontSize: 18, color: C.muted, fontFamily: F.bold },
  bid: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  video: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, paddingHorizontal: 14, borderRadius: 14, backgroundColor: C.panel },
  remove: { fontFamily: F.semibold, fontSize: 14, color: C.muted, padding: 6 },
  track: { height: 8, borderRadius: 4, backgroundColor: C.panel2, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 4, backgroundColor: C.blue },
});
