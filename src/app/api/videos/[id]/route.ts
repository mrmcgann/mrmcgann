import { revalidateTag } from "next/cache";
import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";

// The seller (or an admin) takes a video off their listing.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const admin = supabaseAdmin();
  const { data: v } = await admin.from("lot_videos").select("id, lot_id, submitted_by, upload_path, public_path, status, lots(seller_id)").eq("id", id).maybeSingle();
  const rel = v?.lots as unknown as { seller_id: string | null } | { seller_id: string | null }[] | null;
  const sellerId = (Array.isArray(rel) ? rel[0] : rel)?.seller_id;
  const { data: isAdmin } = await db.rpc("is_admin");
  if (!v || (v.submitted_by !== user.id && sellerId !== user.id && !isAdmin)) return fail("That video wasn't found.", 404);
  await admin.from("lot_videos").update({ status: "removed" }).eq("id", id);
  await Promise.all([
    admin.storage.from("video-uploads").remove([v.upload_path]),
    v.public_path ? admin.storage.from("lot-videos").remove([v.public_path]) : Promise.resolve(),
  ]);
  revalidateTag(`lot-${v.lot_id}`);
  return json({ ok: true });
}
