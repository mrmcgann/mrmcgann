"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { env } from "@/lib/env";
import { VIDEO_MAX, VIDEO_STATUS, VIDEO_TYPES } from "@/lib/videos";

type V = { id: string; title: string; status: string; review_note: string | null; created_at: string };
const TITLES = ["Walkaround", "Cold start", "Engine running", "Interior", "Underbody", "Features"];

// The seller adds a video to their listing. It uploads privately and stays hidden until an admin approves it.
export function SellerVideos({ lotId, videos, canAdd }: { lotId: number; videos: V[]; canAdd: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(TITLES[0]);
  const [progress, setProgress] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const live = videos.filter((v) => v.status !== "removed");
  const room = live.filter((v) => v.status === "pending" || v.status === "approved").length < 3;

  async function upload(file: File) {
    setMsg(null);
    if (!VIDEO_TYPES[file.type]) return setMsg({ ok: false, text: "Use an MP4, MOV or WebM video." });
    if (file.size > VIDEO_MAX) return setMsg({ ok: false, text: "Videos can be up to 250 MB. Trim it, or record at 1080p rather than 4K." });
    setProgress(0);
    try {
      const r1 = await fetch("/api/videos/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, size: file.size, mime: file.type }) });
      const s = await r1.json();
      if (!r1.ok) throw new Error(s.error || "Couldn't start the upload.");
      await new Promise<void>((resolve, reject) => {
        const x = new XMLHttpRequest();
        x.open("PUT", s.signedUrl);
        x.setRequestHeader("content-type", file.type);
        x.setRequestHeader("x-upsert", "false");
        x.setRequestHeader("cache-control", "max-age=3600");
        if (env.supabaseAnonKey) x.setRequestHeader("apikey", env.supabaseAnonKey);
        x.upload.onprogress = (e) => { if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100)); };
        x.onload = () => (x.status >= 200 && x.status < 300 ? resolve() : reject(new Error("The upload didn't finish. Check your connection and try again.")));
        x.onerror = () => reject(new Error("The upload didn't finish. Check your connection and try again."));
        x.send(file);
      });
      const r2 = await fetch("/api/videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lotId, path: s.path, title, size: file.size, mime: file.type }) });
      const d = await r2.json();
      if (!r2.ok) throw new Error(d.error || "Couldn't add the video.");
      setMsg({ ok: true, text: "Uploaded. We review every video before it appears on your listing, usually within one business day." });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't upload the video." });
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this video from your listing?")) return;
    const r = await fetch(`/api/videos/${id}`, { method: "DELETE" });
    if (r.ok) router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <b>Videos</b>
      {live.length === 0 && <span className="muted" style={{ fontSize: 15 }}>Listings with a walkaround video attract more bidders. Film in landscape, in daylight, for 1 to 3 minutes.</span>}
      {live.map((v) => (
        <div key={v.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 14px", borderRadius: 14, background: "var(--panel)" }}>
          <span><b>{v.title}</b> · <span className={v.status === "rejected" ? "errmsg" : "muted"}>{VIDEO_STATUS[v.status] || v.status}{v.status === "rejected" && v.review_note ? `: ${v.review_note}` : ""}</span></span>
          {v.status !== "rejected" && <button className="linkbtn" style={{ color: "var(--muted)", fontWeight: 600 }} onClick={() => remove(v.id)}>Remove</button>}
        </div>
      ))}
      {canAdd && room && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select className="input" aria-label="What the video shows" value={title} onChange={(e) => setTitle(e.target.value)} style={{ width: "auto", height: 46 }} disabled={progress != null}>
            {TITLES.map((t) => <option key={t}>{t}</option>)}
          </select>
          <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
          <button className="btn btn-dark" style={{ height: 46, fontSize: 15 }} disabled={progress != null} onClick={() => input.current?.click()}>
            {progress != null ? `Uploading ${progress}%` : "Add a video"}
          </button>
        </div>
      )}
      {progress != null && <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${progress}%` }} /></div>}
      {msg && <span className={msg.ok ? "notice ok" : "notice bad"} style={{ fontSize: 14 }}>{msg.text}</span>}
      <span className="hint">Up to 3 videos, 250 MB each (MP4, MOV or WebM). Every video is checked by our team before it goes live. No number plates of other vehicles, people&apos;s faces or contact details, please.</span>
    </div>
  );
}
