"use client";
import { useState } from "react";
import { CarArt } from "@/components/CarArt";
import { photoUrl } from "@/lib/photos";

const ANGLES = ["Front 3/4", "Side", "Rear", "Interior", "Dash", "Boot", "Engine", "Tyres"];

export function Gallery({ photos, backdrop, type }: { photos: { path: string; angle: string | null }[]; backdrop: string; type: string }) {
  const [i, setI] = useState(0);
  const has = photos.length > 0;
  const labels = has ? photos.map((p, n) => p.angle || `Photo ${n + 1}`) : ANGLES.slice(0, 3);
  return (
    <div className="gallery" style={{ paddingTop: 40 }}>
      <div className={`stage bg-${backdrop}`}>
        {has ? <img className="lotimg" src={photoUrl(photos[i].path)} alt={labels[i]} /> : <CarArt type={type} flip={i === 2} />}
        {!has && <span className="ph">Photos coming soon</span>}
        <span style={{ position: "absolute", right: 28, bottom: 28, fontWeight: 700, background: "rgba(255,255,255,.85)", padding: "4px 12px", borderRadius: 14 }}>{i + 1} of {labels.length}</span>
      </div>
      <div className="thumbs" role="group" aria-label="Photos">
        {labels.map((a, n) => <button key={n} className={n === i ? "on" : ""} aria-pressed={n === i} onClick={() => setI(n)}>{a}</button>)}
      </div>
    </div>
  );
}
