"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { HeartIcon } from "@/components/CarArt";
import { useViewer } from "@/components/Viewer";

// Heart / watch button. Knows whether you're watching from the signed-in viewer,
// so pages can be cached for everyone.
export function WatchButton({ lotId, initial, title, variant = "icon" }: { lotId: number; initial?: boolean; title: string; variant?: "icon" | "button" }) {
  const viewer = useViewer();
  const [local, setLocal] = useState<boolean | null>(null);
  const on = local ?? (initial ?? viewer.watched.has(lotId));
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    if (viewer.ready && !viewer.user) { router.push(`/signin?next=/lot/${lotId}`); return; }
    setBusy(true);
    const res = await fetch("/api/watch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, on: !on }) });
    setBusy(false);
    if (res.status === 401) { router.push(`/signin?next=/lot/${lotId}`); return; }
    if (res.ok) { setLocal(!on); viewer.setWatched(lotId, !on); }
  }
  if (variant === "button") {
    return (
      <button className="btn btn-soft" onClick={toggle} aria-pressed={on} style={{ height: 52, fontSize: 16 }}>
        <HeartIcon on={on} size={18} />{on ? "On your watchlist" : "Add to watchlist"}
      </button>
    );
  }
  return (
    <button className="heart" onClick={toggle} aria-pressed={on} aria-label={`${on ? "Remove from" : "Add to"} watchlist: ${title}`}>
      <HeartIcon on={on} />
    </button>
  );
}
