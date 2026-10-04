"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CarArt } from "@/components/CarArt";
import { photoUrl, videoUrl } from "@/lib/photos";
import type { LotVideo } from "@/lib/types";

type Photo = { path: string; angle: string | null; credit?: string | null; credit_url?: string | null };
type Item = { kind: "photo"; p: Photo } | { kind: "video"; v: LotVideo };

// The listing's photos and video (up to 10 in total, one of them a video): one large photo with
// four smaller ones beside it (below it on phones), the video second, "Show all", and a
// full-screen viewer with zoom, swipe and keys.
export function Gallery({ photos, backdrop, type, videos = [], externalVideo, title }: {
  photos: Photo[]; backdrop: string; type: string; videos?: LotVideo[]; externalVideo?: string | null; title: string;
}) {
  const video = videos[0] || null;
  const items: Item[] = photos.map((p) => ({ kind: "photo", p }));
  if (video) items.splice(Math.min(1, items.length), 0, { kind: "video", v: video });
  const n = items.length;
  const videoAt = items.findIndex((x) => x.kind === "video");
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const [touchX, setTouchX] = useState<number | null>(null);
  const label = (k: number) => { const it = items[k]; return !it ? "" : it.kind === "video" ? "Video" : it.p.angle || `Photo ${k + 1}`; };
  const go = useCallback((d: number) => { setZoom(null); setI((x) => (x + d + n) % n); }, [n]);
  const show = (k: number) => { setZoom(null); setI(k); setOpen(true); };
  const opener = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLDivElement | null>(null);

  // Keyboard: focus moves into the viewer, Tab stays inside it, Escape closes, focus goes back.
  useEffect(() => {
    if (!open) return;
    opener.current = (document.activeElement as HTMLElement) || null;
    const t = setTimeout(() => dialog.current?.querySelector<HTMLElement>(".lb-top button")?.focus(), 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
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
  }, [open, go]);

  const swipe = {
    onTouchStart: (e: React.TouchEvent) => setTouchX(e.touches[0].clientX),
    onTouchEnd: (e: React.TouchEvent) => { if (touchX != null && !zoom) { const dx = e.changedTouches[0].clientX - touchX; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); } setTouchX(null); },
  };
  const playVideo = () => { if (videoAt >= 0) show(videoAt); else if (externalVideo) window.open(externalVideo, "_blank", "noopener,noreferrer"); };
  const hasVideo = videoAt >= 0 || !!externalVideo;
  const credits = [...new Set(photos.map((p) => p.credit).filter(Boolean))] as string[];
  const showAll = video ? `Show all (${photos.length} photo${photos.length === 1 ? "" : "s"} and video)` : `Show all photos (${n})`;

  const viewer = open && (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Photo and video viewer" ref={dialog} {...swipe}>
      <div className="lb-top"><span>{label(i)} · {i + 1} of {n}</span><button onClick={() => setOpen(false)} aria-label="Close">✕</button></div>
      {items[i]?.kind === "video" ? (
        <div className="lb-stage" style={{ cursor: "default" }}>
          <video key={(items[i] as { v: LotVideo }).v.id} src={videoUrl((items[i] as { v: LotVideo }).v.public_path)} controls autoPlay playsInline preload="metadata" style={{ maxWidth: "100%", maxHeight: "100%" }} />
        </div>
      ) : items[i] ? (
        <div className="lb-stage" role="button" tabIndex={0} aria-label={zoom ? "Zoom out" : "Zoom in"} aria-pressed={!!zoom}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setZoom(zoom ? null : { x: 50, y: 50 }); } }}
          onClick={(e) => {
            if (zoom) { setZoom(null); return; }
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
          }}>
          <img src={photoUrl((items[i] as { p: Photo }).p.path)} alt={label(i)} style={zoom ? { transform: "scale(2.5)", transformOrigin: `${zoom.x}% ${zoom.y}%`, cursor: "zoom-out" } : { cursor: "zoom-in" }} />
        </div>
      ) : null}
      {n > 1 && (<>
        <button className="lb-arrow l" onClick={() => go(-1)} aria-label="Previous">‹</button>
        <button className="lb-arrow r" onClick={() => go(1)} aria-label="Next">›</button>
      </>)}
      {n > 1 && (
        <div className="lb-strip" role="group" aria-label="All photos and video">
          {items.map((it, k) => (
            <button key={k} className={`${k === i ? "on" : ""}${it.kind === "video" ? " vid" : ""}`} aria-pressed={k === i} aria-label={label(k)} onClick={() => { setZoom(null); setI(k); }}>
              {it.kind === "video" ? <span aria-hidden="true">▶</span> : <img src={photoUrl(it.p.path)} alt="" loading="lazy" />}
            </button>
          ))}
        </div>
      )}
      <span className="lb-hint">
        {items[i]?.kind === "photo" && (items[i] as { p: Photo }).p.credit ? <>Photo: {(items[i] as { p: Photo }).p.credit_url ? <a href={(items[i] as { p: Photo }).p.credit_url!} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>{(items[i] as { p: Photo }).p.credit}</a> : (items[i] as { p: Photo }).p.credit}. </> : null}
        {items[i]?.kind === "video" ? "Swipe or use the arrow keys for the photos." : "Tap to zoom. Swipe or use the arrow keys."}
      </span>
    </div>
  );

  if (!photos.length) {
    return (
      <div className="gallery" style={{ paddingTop: 40 }}>
        <div className={`stage bg-${backdrop}`}><CarArt type={type} /><span className="ph">Photos to come</span>
          {hasVideo && <div className="mosaic-actions"><button onClick={playVideo}>▶ Play video</button><span /></div>}
        </div>
        {viewer}
      </div>
    );
  }

  const tiles = items.slice(0, 5);
  return (
    <div className="gallery" style={{ paddingTop: 40 }}>
      <div className={`mosaic n${Math.min(n, 5)}`} aria-label={`${photos.length} photo${photos.length === 1 ? "" : "s"}${video ? " and a video" : ""} of the ${title}`}>
        {tiles.map((it, k) => (
          <button key={k} className={`tile t${k}${it.kind === "video" ? " vidtile" : ""}`} onClick={() => show(k)} aria-label={`${it.kind === "video" ? "Play the video" : `View ${label(k)}`}${k === 4 && n > 5 ? ` and ${n - 5} more` : ""}`}>
            {it.kind === "video"
              ? <><video src={`${videoUrl(it.v.public_path)}#t=0.5`} muted playsInline preload="metadata" tabIndex={-1} aria-hidden="true" /><span className="playbadge" aria-hidden="true">▶</span><span className="vidlabel" aria-hidden="true">Video</span></>
              : <img src={photoUrl(it.p.path)} alt={k === 0 ? title : label(k)} loading={k === 0 ? "eager" : "lazy"} fetchPriority={k === 0 ? "high" : "auto"} />}
            {k === 4 && n > 5 && <span className="more">+{n - 5}</span>}
          </button>
        ))}
        <div className="mosaic-actions">
          {hasVideo ? <button onClick={playVideo}>▶ Play video</button> : <span />}
          <button onClick={() => show(0)}>{showAll}</button>
        </div>
      </div>
      {credits.length > 0 && <p className="hint" style={{ marginTop: 10, textAlign: "right" }}>Photos: {credits.map((c, k) => {
        const url = photos.find((p) => p.credit === c)?.credit_url;
        return <span key={c}>{k ? " · " : ""}{url ? <a className="blue" href={url} target="_blank" rel="noopener noreferrer">{c}</a> : c}</span>;
      })}</p>}
      {viewer}
    </div>
  );
}
