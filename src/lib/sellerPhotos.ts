import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { IMAGE_TYPES, stripImageMetadata } from "@/lib/mediaPrivacy";
import { MEDIA_MAX } from "@/lib/videos";

const ANGLES = ["Front 3/4", "Side", "Rear 3/4", "Rear"];

// The photos the seller sent with the sell form become the draft listing's photos: we're never at the vehicle. Each is
// copied from the private appraisal bucket to the public listing bucket with everything but the picture removed
// (stripImageMetadata: EXIF and its GPS, XMP, IPTC, comments), whatever the seller's browser did. Anything that isn't a
// JPEG, PNG or WebP stays private. Room is kept for the walkaround video (10 photos and videos in all). Staff then check
// each photo in the editor, including that nothing shows who or where the seller is.
export async function copySellerPhotos(db: SupabaseClient, paths: string[], lotId: number): Promise<{ copied: number; skipped: number }> {
  let copied = 0, skipped = 0;
  for (const path of paths.slice(0, MEDIA_MAX - 1)) {
    try {
      const { data, error } = await db.storage.from("appraisal-photos").download(path);
      if (error || !data) { skipped++; continue; }
      const clean = stripImageMetadata(new Uint8Array(await data.arrayBuffer()));
      if (!clean) { skipped++; continue; }
      const dest = `${lotId}/${crypto.randomUUID()}.${clean.kind === "jpeg" ? "jpg" : clean.kind}`;
      const up = await db.storage.from("lot-photos").upload(dest, clean.bytes, { contentType: IMAGE_TYPES[clean.kind], upsert: false });
      if (up.error) { skipped++; continue; }
      const { error: ie } = await db.from("lot_photos").insert({ lot_id: lotId, path: dest, angle: ANGLES[Math.min(copied, ANGLES.length - 1)], sort: copied });
      if (ie) { await db.storage.from("lot-photos").remove([dest]); skipped++; break; }
      copied++;
    } catch { skipped++; }
  }
  return { copied, skipped: skipped + Math.max(0, paths.length - (MEDIA_MAX - 1)) };
}
