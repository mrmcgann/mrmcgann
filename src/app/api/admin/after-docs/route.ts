import { adminApi, audit } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";

// A one-off upload link for one of the state's forms that go with an offer to sell a vehicle after the auction (staff
// only), into the private bucket after-sale-docs. The offer stores the path; buyers download it through
// /api/offers/[id]/doc, never straight from storage.
const TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };
const MAX = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const { s, error } = await adminApi();
  if (error) return error;
  const { lotId, size, mime, name } = await req.json().catch(() => ({}));
  const id = Number(lotId);
  if (!Number.isSafeInteger(id) || id <= 0) return fail("Which vehicle?");
  const ext = TYPES[String(mime)];
  if (!ext) return fail("Upload a PDF (or a JPG or PNG of a signed page).");
  if (!(Number(size) > 0) || Number(size) > MAX) return fail("Files can be up to 10 MB.");
  const db = supabaseAdmin();
  const { data: lot } = await db.from("lots").select("id, status").eq("id", id).maybeSingle();
  if (!lot) return fail("We couldn't find that vehicle.", 404);
  const path = `${id}/${crypto.randomUUID()}.${ext}`;
  const { data, error: e } = await db.storage.from("after-sale-docs").createSignedUploadUrl(path);
  if (e || !data) return fail("Couldn't start the upload. Please try again.", 500);
  await audit(s.user?.id, "after-sale document upload", `lotId:${id}`, { name: String(name || "").slice(0, 160), path }, "ok");
  return json({ path, signedUrl: data.signedUrl, token: data.token });
}
