import "server-only";
import { revalidateTag } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { blankLocation, findMoov, type Reader } from "@/lib/mediaPrivacy";
import { VIDEO_MAX, VIDEO_TYPES } from "@/lib/videos";

const TYPE_OF = Object.fromEntries(Object.entries(VIDEO_TYPES).map(([mime, ext]) => [ext, mime]));

// Reads a stored file in pieces (or all at once when the store doesn't serve pieces).
async function readerFor(url: string): Promise<{ read: Reader; size: number; whole: Uint8Array | null }> {
  const first = await fetch(url, { headers: { Range: "bytes=0-15" }, cache: "no-store" });
  if (first.status === 206) {
    const total = Number(first.headers.get("content-range")?.split("/")[1]);
    await first.arrayBuffer();
    if (Number.isFinite(total) && total > 0) {
      return {
        size: total, whole: null,
        read: async (start, length) => {
          const r = await fetch(url, { headers: { Range: `bytes=${start}-${start + length - 1}` }, cache: "no-store" });
          if (r.status !== 206) throw new Error(`range read ${r.status}`);
          return new Uint8Array(await r.arrayBuffer());
        },
      };
    }
  }
  if (!first.ok) throw new Error(`read ${first.status}`);
  const whole = new Uint8Array(await first.arrayBuffer());
  return { size: whole.length, whole, read: async (start, length) => whole.slice(start, start + length) };
}

/** The video with the place it was filmed blanked (phones record it), or null when there's nothing to blank. */
async function withoutPlace(path: string): Promise<Uint8Array | null> {
  const { data: signed, error } = await supabaseAdmin().storage.from("video-uploads").createSignedUrl(path, 600);
  if (error || !signed?.signedUrl) throw new Error("no link");
  const { read, size, whole } = await readerFor(signed.signedUrl);
  if (size > VIDEO_MAX + 1024 * 1024) throw new Error("too big");
  const moov = await findMoov(read, size);
  if (!moov) return null; // not MP4 or MOV (WebM files from a browser don't record a place)
  if (moov.size > 64 * 1024 * 1024) throw new Error("movie box too big");
  const box = await read(moov.start, moov.size);
  if (blankLocation(box) === 0) return null;
  const all = whole || new Uint8Array(await (await fetch(signed.signedUrl, { cache: "no-store" })).arrayBuffer());
  if (all.length !== size) throw new Error("short read");
  all.set(box, moov.start);
  return all;
}

// Copies an uploaded video into the public bucket and marks it approved (only if it's still waiting: the seller may
// have withdrawn it meanwhile). The place it was filmed is blanked first, so a walkaround filmed at the seller's home
// can't give their address away; if the file can't be checked, it isn't published. Used by admin approval, and
// straight away when an admin adds the video to a listing themselves.
export async function publishVideo(videoId: string, reviewerId: string): Promise<{ ok: true; lotId: number } | { ok: false; error: string }> {
  const db = supabaseAdmin();
  const { data: v } = await db.from("lot_videos").select("id, lot_id, upload_path, status").eq("id", videoId).maybeSingle();
  if (!v || v.status !== "pending") return { ok: false, error: "That video isn't waiting for approval." };
  const ext = v.upload_path.split(".").pop() || "mp4";
  const publicPath = `${v.lot_id}/${v.id}.${ext}`;
  let clean: Uint8Array | null;
  try { clean = await withoutPlace(v.upload_path); } catch { return { ok: false, error: "Couldn't check the video for the location the phone recorded. Please try again." }; }
  const { error: copyErr } = clean
    ? await db.storage.from("lot-videos").upload(publicPath, clean, { contentType: TYPE_OF[ext] || "video/mp4", upsert: true })
    : await db.storage.from("video-uploads").copy(v.upload_path, publicPath, { destinationBucket: "lot-videos" });
  if (copyErr) return { ok: false, error: `Couldn't publish the video: ${copyErr.message}` };
  const { data: done } = await db.from("lot_videos").update({ status: "approved", public_path: publicPath, reviewed_by: reviewerId, reviewed_at: new Date().toISOString(), review_note: null })
    .eq("id", v.id).eq("status", "pending").select("id");
  if (!done?.length) { await db.storage.from("lot-videos").remove([publicPath]); return { ok: false, error: "That video was withdrawn." }; }
  await db.storage.from("video-uploads").remove([v.upload_path]); // the public copy is the one we keep
  revalidateTag(`lot-${v.lot_id}`);
  return { ok: true, lotId: v.lot_id };
}
