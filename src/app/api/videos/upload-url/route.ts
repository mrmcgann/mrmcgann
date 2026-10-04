import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { allow } from "@/lib/ratelimit";
import { json, fail } from "@/lib/api";
import { MEDIA_MAX, VIDEO_MAX, VIDEO_OPEN_STATUSES as OPEN, VIDEO_TYPES, VIDEOS_PER_LOT } from "@/lib/videos";

// Step 1 of adding a video: check the seller may add one, then hand back a one-off upload link
// for the private uploads bucket. Nothing is public until an admin approves it.
export async function POST(req: Request) {
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const { lotId, size, mime } = await req.json().catch(() => ({}));
  const ext = VIDEO_TYPES[String(mime)];
  if (!ext) return fail("Use an MP4, MOV or WebM video.");
  if (!(Number(size) > 0) || Number(size) > VIDEO_MAX) return fail("Videos can be up to 250 MB. Try trimming it, or recording at 1080p.");
  if (!(await allow(`video:${user.id}`, 10, 86400))) return fail("Too many uploads today. Please call us.", 429);
  const admin = supabaseAdmin();
  const [{ data: lot }, { data: isAdmin }] = await Promise.all([
    admin.from("lots").select("id, seller_id, status").eq("id", Number(lotId)).maybeSingle(),
    db.rpc("is_admin"),
  ]);
  if (!lot) return fail("That vehicle wasn't found.", 404);
  if (lot.seller_id !== user.id && !isAdmin) return fail("Only the seller can add a video to this listing.", 403);
  if (!OPEN.includes(lot.status)) return fail("Videos can only be added while the vehicle is listed.");
  const [{ count: vids }, { data: media }] = await Promise.all([
    admin.from("lot_videos").select("id", { count: "exact", head: true }).eq("lot_id", lot.id).in("status", ["pending", "approved"]),
    admin.rpc("lot_media_count", { p_lot: lot.id }),
  ]);
  if ((vids || 0) >= VIDEOS_PER_LOT) return fail("A listing can have one video. Remove the current one first.");
  if (Number(media || 0) >= MEDIA_MAX) return fail("A listing can have 10 photos and videos in total. Remove a photo first.");
  const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage.from("video-uploads").createSignedUploadUrl(path);
  if (error || !data) return fail("Couldn't start the upload. Please try again.", 500);
  // Remembered so an upload that's never turned into a video request is deleted after a day.
  await admin.from("video_upload_slots").insert({ path, user_id: user.id, lot_id: lot.id });
  return json({ path, signedUrl: data.signedUrl, token: data.token });
}
