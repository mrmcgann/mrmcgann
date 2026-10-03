import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { kickOutbox } from "@/lib/notify";
import { json, fail, friendly } from "@/lib/api";
import { env } from "@/lib/env";

// Step 2: once the file is uploaded, ask for it to be added to the listing (pending review).
// The size and type come from the stored file, not from what the browser says.
export async function POST(req: Request) {
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const { lotId, path, title } = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();
  const { data: slot } = await admin.from("video_upload_slots").select("lot_id").eq("path", String(path)).eq("user_id", user.id).maybeSingle();
  if (!slot || slot.lot_id !== Number(lotId)) return fail("Upload the video first.");
  const { data: info, error: infoErr } = await admin.storage.from("video-uploads").info(String(path));
  if (infoErr || !info) return fail("The upload didn't finish. Please try again.");
  const meta = info as unknown as { size?: number; contentType?: string; metadata?: { size?: number; mimetype?: string } };
  const size = Number(meta.size ?? meta.metadata?.size ?? 0);
  const mime = String(meta.contentType ?? meta.metadata?.mimetype ?? "");
  const { data: id, error } = await db.rpc("request_lot_video", { p_lot: Number(lotId), p_path: String(path), p_title: String(title || ""), p_size: size, p_mime: mime });
  if (error) return fail(friendly(error.message));
  const { data: lot } = await admin.from("lots").select("title").eq("id", Number(lotId)).maybeSingle();
  await admin.from("outbox").insert({ channel: "email", to_addr: env.supportEmail, kind: "lead", title: `Video to review: lot ${lotId} ${lot?.title || ""}`,
    body: "A new listing video is waiting for approval.", link: "/admin/videos", dedupe_key: `video:${id}:staff`, priority: 3 });
  kickOutbox();
  return json({ ok: true, id });
}

// The seller's own videos for a listing (with review status), for the seller dashboard and app.
export async function GET(req: Request) {
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const lotId = Number(new URL(req.url).searchParams.get("lot"));
  const { data } = await db.from("lot_videos").select("id, lot_id, title, status, review_note, created_at, public_path").eq("lot_id", lotId).neq("status", "removed").order("created_at");
  return json({ videos: data || [] }, 200);
}
