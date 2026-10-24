"use client";
import { useEffect, useMemo, useState } from "react";
import { CarArt } from "@/components/CarArt";
import { photoUrl, videoUrl } from "@/lib/photos";
import type { LotPhoto, LotVideo } from "@/lib/types";

type Item = { kind: "photo"; p: Pick<LotPhoto, "path" | "angle" | "credit"> } | { kind: "video"; v: Pick<LotVideo, "id" | "public_path" | "title"> };

// The live room's stage: the vehicle's own photos and the seller's walkaround video (there's no video of the auction).
// One big frame, arrows, and a strip of thumbnails; the video is second, as on the listing. While nobody has touched it,
// it moves through the photos every few seconds (never onto the video, and not at all with reduced motion).
export function LiveMedia({ lotId, title, category, photos, videos, externalVideo }: {
  lotId: number; title: string; category: string;
  photos: Pick<LotPhoto, "path" | "angle" | "credit">[]; videos: Pick<LotVideo, "id" | "public_path" | "title">[]; externalVideo?: string | null;
}) {
  const items = useMemo(() => {
    const list: Item[] = photos.map((p) => ({ kind: "photo", p }));
    if (videos[0]) list.splice(Math.min(1, list.length), 0, { kind: "video", v: videos[0] });
    return list;
  }, [photos, videos]);
  const n = items.length;
  const videoAt = items.findIndex((x) => x.kind === "video");
  const [i, setI] = useState(0);
  const [touched, setTouched] = useState(false);
  useEffect(() => { setI(0); setTouched(false); }, [lotId]);
  // (numbers only in the dependencies: the room's data is fetched again every few seconds, which mustn't restart this)
  useEffect(() => {
    if (touched || n < 2 || (n === 2 && videoAt >= 0)) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setI((x) => {
      let k = (x + 1) % n;
      if (k === videoAt) k = (k + 1) % n;
      return k;
    }), 5000);
    return () => clearInterval(t);
  }, [touched, n, videoAt, lotId]);
  const pick = (k: number) => { setTouched(true); setI((k + n) % n); };
  const at = items[Math.min(i, Math.max(0, n - 1))];
  const name = (it: Item, k: number) => (it.kind === "video" ? "the seller's walkaround video" : it.p.angle || `photo ${k + 1}`);

  if (!n) {
    return (
      <div className="lv-media">
        <div className="lv-frame lv-empty"><CarArt type={category === "motorbikes" ? "bike" : "car"} /></div>
        {externalVideo ? <a className="blue" href={externalVideo} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700 }}>Watch the seller&apos;s video ›</a> : null}
      </div>
    );
  }
  return (
    <div className="lv-media" data-testid="live-media">
      <div className="lv-frame">
        {at.kind === "photo"
          ? <img key={at.p.path} src={photoUrl(at.p.path)} alt={`The ${title}: ${name(at, i)}`} />
          : <video key={at.v.id} src={videoUrl(at.v.public_path)} controls playsInline preload="metadata" autoPlay={touched} aria-label={`The ${title}: the seller's walkaround video`} data-testid="live-video" />}
        {n > 1 && (
          <>
            <button type="button" className="lv-nav prev" onClick={() => pick(i - 1)} aria-label="Previous photo">‹</button>
            <button type="button" className="lv-nav next" onClick={() => pick(i + 1)} aria-label="Next photo">›</button>
          </>
        )}
        <span className="lv-count" aria-hidden="true">{i + 1} of {n}</span>
        {videoAt >= 0 && at.kind !== "video" && (
          <button type="button" className="lv-playv" onClick={() => pick(videoAt)} data-testid="live-play-video"><span aria-hidden="true">▶</span> Seller&apos;s video</button>
        )}
      </div>
      {n > 1 && (
        <div className="lv-thumbs" role="group" aria-label={`Photos and video of the ${title}`}>
          {items.map((it, k) => (
            <button type="button" key={it.kind === "photo" ? it.p.path : `v-${it.v.id}`} className={k === i ? "on" : undefined} onClick={() => pick(k)} aria-label={`Show ${name(it, k)}`} aria-pressed={k === i}>
              {it.kind === "photo" ? <img src={photoUrl(it.p.path)} alt="" loading="lazy" /> : <span className="lv-vthumb"><b aria-hidden="true">▶</b>Video</span>}
            </button>
          ))}
        </div>
      )}
      {at.kind === "photo" && at.p.credit ? <span className="hint" style={{ margin: 0 }}>Photo: {at.p.credit}</span> : null}
    </div>
  );
}
