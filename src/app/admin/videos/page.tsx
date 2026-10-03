import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { AdminAction } from "@/components/AdminAction";
import { videoUrl } from "@/lib/photos";
import { dateTime } from "@/lib/format";
import { VIDEO_STATUS } from "@/lib/videos";

type Row = { id: string; lot_id: number; title: string; status: string; upload_path: string; public_path: string | null; size_bytes: number | null; review_note: string | null; created_at: string; lots: { title: string } | { title: string }[] | null; profiles: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null };
const one = <T,>(x: T | T[] | null): T | null => (Array.isArray(x) ? x[0] : x);

// Every listing video is checked here before anyone can see it.
export default async function Videos({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin(); // checked on every page, not just the layout
  const { status = "pending" } = await searchParams;
  const db = supabaseAdmin();
  let q = db.from("lot_videos").select("id, lot_id, title, status, upload_path, public_path, size_bytes, review_note, created_at, lots(title), profiles!lot_videos_submitted_by_fkey(first_name, last_name)").order("created_at", { ascending: status === "pending" }).limit(100);
  if (status !== "all") q = q.eq("status", status);
  const { data } = await q;
  const rows = (data || []) as unknown as Row[];
  // Private preview links for videos still under review (valid for an hour).
  const pending = rows.filter((r) => r.status === "pending");
  const { data: signed } = pending.length ? await db.storage.from("video-uploads").createSignedUrls(pending.map((r) => r.upload_path), 3600) : { data: [] };
  const preview = new Map((signed || []).map((s, k) => [pending[k].id, s.signedUrl]));

  return (
    <>
      <h1 className="d2">Videos.</h1>
      <p className="muted">Approve only videos of this vehicle that are accurate and safe to publish: no faces, other people&apos;s number plates, contact details, music you don&apos;t have rights to, or anything misleading about condition.</p>
      <div className="pill-row">{["pending", "approved", "rejected", "all"].map((s) => <Link key={s} className="pill pill-soft" href={`/admin/videos?status=${s}`} style={status === s ? { background: "var(--ink)", color: "#FFFFFF" } : undefined}>{s}</Link>)}</div>
      {rows.length === 0 && <div className="empty"><b>Nothing here.</b></div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 16 }}>
        {rows.map((v) => {
          const src = v.status === "pending" ? preview.get(v.id) : v.public_path ? videoUrl(v.public_path) : null;
          const who = one(v.profiles);
          return (
            <div className="admin-card" key={v.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {src ? <video src={src} controls preload="metadata" style={{ width: "100%", borderRadius: 14, background: "#000", aspectRatio: "16 / 9" }} /> : <div className="empty" style={{ padding: 20 }}>No preview</div>}
              <b><Link href={`/admin/lots/${v.lot_id}`}>{one(v.lots)?.title}</Link> · {v.title}</b>
              <span className="muted" style={{ fontSize: 14 }}>{VIDEO_STATUS[v.status]} · from {who?.first_name} {who?.last_name} · {dateTime(v.created_at)}{v.size_bytes ? ` · ${(v.size_bytes / 1048576).toFixed(0)} MB` : ""}</span>
              {v.review_note && <span className="muted" style={{ fontSize: 14 }}>Note: {v.review_note}</span>}
              <span className="pill-row">
                {v.status === "pending" && <AdminAction action="approve-video" payload={{ videoId: v.id }} label="Approve and publish" tone="blue" />}
                {v.status === "pending" && <AdminAction action="reject-video" payload={{ videoId: v.id }} label="Reject" input={{ name: "note", placeholder: "Why (sent to the seller)" }} tone="bad" />}
                {v.status === "approved" && <AdminAction action="remove-video" payload={{ videoId: v.id }} label="Take down" confirmText="Remove it from the listing?" tone="bad" />}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
