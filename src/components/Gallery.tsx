"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CarArt } from "@/components/CarArt";
import { photoUrl, videoUrl } from "@/lib/photos";
import type { LotVideo } from "@/lib/types";

type Photo = { path: string; angle: string | null; credit?: string | null; credit_url?: string | null };

// The listing's photos: one large photo with four smaller ones beside it (below it on phones),
// "Show all photos", approved videos, and a full-screen viewer with zoom, swipe and keys.
export function Gallery({ photos, backdrop, type, videos = [], externalVideo, title }: {
  photos: Photo[]; backdrop: string; type: string; videos?: LotVideo[]; externalVideo?: string | null; title: string;
}) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [touchX, setTouchX] = useState<number | null>(null);
  const n = photos.length;
  const label = (k: number) => photos[k]?.angle || `Photo ${k + 1}`;
  const go = useCallback((d: number) => { setZoom(null); setI((x) => (x + d + n) % n); }, [n]);
  const show = (k: number) => { setZoom(null); setI(k); setOpen(true); };
  const hasVideo = videos.length > 0 || !!externalVideo;
  const opener = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLDivElement | null>(null);
  const isOpen = open || playing != null;

  // Keyboard: focus moves into the viewer, Tab stays inside it, Escape closes, focus goes back.
  useEffect(() => {
    if (!isOpen) return;
    opener.current = (document.activeElement as HTMLElement) || null;
    const t = setTimeout(() => dialog.current?.querySelector<HTMLElement>(".lb-top button")?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); setPlaying(null); }
      if (open && e.key === "ArrowRight") go(1);
      if (open && e.key === "ArrowLeft") go(-1);
      if (e.key === "Tab" && dialog.current) {
        const f = [...dialog.current.querySelectorAll<HTMLElement>("button, [href], video, [tabindex]:not([tabindex='-1'])")].filter((x) => !x.hasAttribute("disabled"));
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { clearTimeout(t); document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; opener.current?.focus?.(); };
  }, [isOpen, open, go]);

  const swipe = {
    onTouchStart: (e: React.TouchEvent) => setTouchX(e.touches[0].clientX),
    onTouchEnd: (e: React.TouchEvent) => { if (touchX != null && !zoom) { const dx = e.changedTouches[0].clientX - touchX; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); } setTouchX(null); },
  };
  const playVideo = () => { if (videos.length) setPlaying(0); else if (externalVideo) window.open(externalVideo, "_blank", "noopener,noreferrer"); };
  const credits = [...new Set(photos.map((p) => p.credit).filter(Boolean))] as string[];

  if (!n) {
    return (
      <div className="gallery" style={{ paddingTop: 40 }}>
        <div className={`stage bg-${backdrop}`}><CarArt type={type} /><span className="ph">Photos to come</span>
          {hasVideo && <div className="mosaic-actions"><button onClick={playVideo}>▶ Play video</button><span /></div>}
        </div>
        {playing != null && <VideoViewer videos={videos} index={playing} onPick={setPlaying} onClose={() => setPlaying(null)} dialog={dialog} />}
      </div>
    );
  }

  const tiles = photos.slice(0, 5);
  return (
    <div className="gallery" style={{ paddingTop: 40 }}>
      <div className={`mosaic n${Math.min(n, 5)}`} aria-label={`${n} photos of the ${title}`}>
        {tiles.map((p, k) => (
          <button key={k} className={`tile t${k}`} onClick={() => show(k)} aria-label={`View ${label(k)}${k === 4 && n > 5 ? ` and ${n - 5} more photos` : ""}`}>
            <img src={photoUrl(p.path)} alt={k === 0 ? title : label(k)} loading={k === 0 ? "eager" : "lazy"} fetchPriority={k === 0 ? "high" : "auto"} />
            {k === 4 && n > 5 && <span className="more">+{n - 5}</span>}
          </button>
        ))}
        <div className="mosaic-actions">
          {hasVideo ? <button onClick={playVideo}>▶ Play video{videos.length > 1 ? `s (${videos.length})` : ""}</button> : <span />}
          <button onClick={() => show(0)}>Show all photos ({n})</button>
        </div>
      </div>
      {credits.length > 0 && <p className="hint" style={{ marginTop: 10, textAlign: "right" }}>Photos: {credits.map((c, k) => {
        const url = photos.find((p) => p.credit === c)?.credit_url;
        return <span key={c}>{k ? " · " : ""}{url ? <a className="blue" href={url} target="_blank" rel="noopener noreferrer">{c}</a> : c}</span>;
      })}</p>}

      {open && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo viewer" ref={dialog} {...swipe}>
          <div className="lb-top"><span>{label(i)} · {i + 1} of {n}</span><button onClick={() => setOpen(false)} aria-label="Close">✕</button></div>
          <div className="lb-stage" role="button" tabIndex={0} aria-label={zoom ? "Zoom out" : "Zoom in"} aria-pressed={!!zoom}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setZoom(zoom ? null : { x: 50, y: 50 }); } }}
            onClick={(e) => {
              if (zoom) { setZoom(null); return; }
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
            }}>
            <img src={photoUrl(photos[i].path)} alt={label(i)} style={zoom ? { transform: "scale(2.5)", transformOrigin: `${zoom.x}% ${zoom.y}%`, cursor: "zoom-out" } : { cursor: "zoom-in" }} />
          </div>
          {n > 1 && (<>
            <button className="lb-arrow l" onClick={() => go(-1)} aria-label="Previous photo">‹</button>
            <button className="lb-arrow r" onClick={() => go(1)} aria-label="Next photo">›</button>
          </>)}
          <div className="lb-strip" role="group" aria-label="All photos">
            {photos.map((p, k) => (
              <button key={k} className={k === i ? "on" : ""} aria-pressed={k === i} aria-label={label(k)} onClick={() => { setZoom(null); setI(k); }}>
                <img src={photoUrl(p.path)} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          <span className="lb-hint">{photos[i].credit ? <>Photo: {photos[i].credit_url ? <a href={photos[i].credit_url!} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>{photos[i].credit}</a> : photos[i].credit}. </> : null}Tap to zoom. Swipe or use the arrow keys.</span>
        </div>
      )}
      {playing != null && <VideoViewer videos={videos} index={playing} onPick={setPlaying} onClose={() => setPlaying(null)} dialog={dialog} />}
    </div>
  );
}

function VideoViewer({ videos, index, onPick, onClose, dialog }: { videos: LotVideo[]; index: number; onPick: (i: number) => void; onClose: () => void; dialog?: React.Ref<HTMLDivElement> }) {
  const v = videos[index];
  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Video" ref={dialog}>
      <div className="lb-top"><span>{v.title} · video {index + 1} of {videos.length}</span><button onClick={onClose} aria-label="Close">✕</button></div>
      <div className="lb-stage" style={{ cursor: "default" }}>
        <video key={v.id} src={videoUrl(v.public_path)} controls autoPlay playsInline preload="metadata" style={{ maxWidth: "100%", maxHeight: "100%" }} />
      </div>
      {videos.length > 1 && (
        <div className="lb-strip" role="group" aria-label="Videos">
          {videos.map((x, k) => <button key={x.id} className={`vid ${k === index ? "on" : ""}`} aria-pressed={k === index} onClick={() => onPick(k)}>▶ {x.title}</button>)}
        </div>
      )}
    </div>
  );
}
