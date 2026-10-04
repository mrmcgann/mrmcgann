import "server-only";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Copies an uploaded video into the public bucket and marks it approved (only if it's still
// waiting: the seller may have withdrawn it meanwhile). Used by admin approval, and straight
// away when an admin adds the video to a listing themselves.
export async function publishVideo(videoId: string, reviewerId: string): Promise<{ ok: true; lotId: number } | { ok: false; error: string }> {
  const db = supabaseAdmin();
  const { data: v } = await db.from("lot_videos").select("id, lot_id, upload_path, status").eq("id", videoId).maybeSingle();
  if (!v || v.status !== "pending") return { ok: false, error: "That video isn't waiting for approval." };
  const ext = v.upload_path.split(".").pop() || "mp4";
  const publicPath = `${v.lot_id}/${v.id}.${ext}`;
  const { error: copyErr } = await db.storage.from("video-uploads").copy(v.upload_path, publicPath, { destinationBucket: "lot-videos" });
  if (copyErr) return { ok: false, error: `Couldn't publish the video: ${copyErr.message}` };
  const { data: done } = await db.from("lot_videos").update({ status: "approved", public_path: publicPath, reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), review_note: null })
    .eq("id", v.id).eq("status", "pending").select("id");
  if (!done?.length) { await db.storage.from("lot-videos").remove([publicPath]); return { ok: false, error: "That video was withdrawn." }; }
  await db.storage.from("video-uploads").remove([v.upload_path]); // the public copy is the one we keep
  revalidateTag(`lot-${v.lot_id}`);
  return { ok: true, lotId: v.lot_id };
}
