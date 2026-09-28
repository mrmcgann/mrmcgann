"use client";
import { useCallback, useEffect, useState } from "react";
import { CarArt } from "@/components/CarArt";
import { photoUrl } from "@/lib/photos";

const ANGLES = ["Front 3/4", "Side", "Rear", "Interior", "Dash", "Boot", "Engine", "Tyres"];

// Photo stage with thumbnails, plus a full-screen viewer: arrows, swipe, keyboard,
// and tap to zoom into any part of the photo (flaws are easy to inspect).
export function Gallery({ photos, backdrop, type, video }: { photos: { path: string; angle: string | null }[]; backdrop: string; type: string; video?: string | null }) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [touchX, setTouchX] = useState<number | null>(null);
  const has = photos.length > 0;
  const n = has ? photos.length : 3;
  const labels = has ? photos.map((p, k) => p.angle || `Photo ${k + 1}`) : ANGLES.slice(0, 3);
  const go = useCallback((d: number) => { setZoom(null); setI((x) => (x + d + n) % n); }, [n]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, go]);

  const swipe = {
    onTouchStart: (e: React.TouchEvent) => setTouchX(e.touches[0].clientX),
    onTouchEnd: (e: React.TouchEvent) => { if (touchX != null && !zoom) { const dx = e.changedTouches[0].clientX - touchX; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); } setTouchX(null); },
  };

  return (
    <div className="gallery" style={{ paddingTop: 40 }}>
      <div className={`stage bg-${backdrop}`} {...swipe}>
        {has ? (
          <button className="stage-open" onClick={() => setOpen(true)} aria-label={`Open ${labels[i]} full screen`}>
            <img className="lotimg" src={photoUrl(photos[i].path)} alt={labels[i]} />
          </button>
        ) : <CarArt type={type} flip={i === 2} />}
        {!has && <span className="ph">Photos coming soon</span>}
        {has && n > 1 && (<>
          <button className="stage-arrow l" onClick={() => go(-1)} aria-label="Previous photo">‹</button>
          <button className="stage-arrow r" onClick={() => go(1)} aria-label="Next photo">›</button>
        </>)}
        <span style={{ position: "absolute", right: 28, bottom: 28, fontWeight: 700, background: "rgba(255,255,255,.85)", padding: "4px 12px", borderRadius: 14 }}>{i + 1} of {labels.length}</span>
      </div>
      <div className="thumbs" role="group" aria-label="Photos">
        {labels.map((a, k) => <button key={k} className={k === i ? "on" : ""} aria-pressed={k === i} onClick={() => { setZoom(null); setI(k); }}>{a}</button>)}
        {video && <a className="thumbs-video" href={video} target="_blank" rel="noopener noreferrer">▶ Walkaround video</a>}
      </div>
      {open && has && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer" {...swipe}>
          <div className="lb-top"><span>{labels[i]} · {i + 1} of {n}</span><button onClick={() => setOpen(false)} aria-label="Close">✕</button></div>
          <div className="lb-stage" onClick={(e) => {
            if (zoom) { setZoom(null); return; }
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
          }}>
            <img src={photoUrl(photos[i].path)} alt={labels[i]} style={zoom ? { transform: "scale(2.5)", transformOrigin: `${zoom.x}% ${zoom.y}%`, cursor: "zoom-out" } : { cursor: "zoom-in" }} />
          </div>
          {n > 1 && (<>
            <button className="lb-arrow l" onClick={() => go(-1)} aria-label="Previous photo">‹</button>
            <button className="lb-arrow r" onClick={() => go(1)} aria-label="Next photo">›</button>
          </>)}
          <span className="lb-hint">Tap the photo to zoom. Swipe or use the arrow keys to move.</span>
        </div>
      )}
    </div>
  );
}
