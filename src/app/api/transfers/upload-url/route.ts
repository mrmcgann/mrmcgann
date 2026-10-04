import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { allow } from "@/lib/ratelimit";
import { json, fail } from "@/lib/api";
import { PROOF_MAX, PROOF_TYPES } from "@/lib/transfer";

// A one-off upload link for the buyer's proof of transfer (or permit), into a private bucket.
export async function POST(req: Request) {
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const { invoiceId, size, mime } = await req.json().catch(() => ({}));
  const ext = PROOF_TYPES[String(mime)];
  if (!ext) return fail("Upload a photo (JPG, PNG, HEIC) or a PDF.");
  if (!(Number(size) > 0) || Number(size) > PROOF_MAX) return fail("Files can be up to 10 MB.");
  if (!(await allow(`transfer-upload:${user.id}`, 20, 86400))) return fail("Too many uploads today. Please call us.", 429);
  const { data: t } = await db.from("ownership_transfers").select("invoice_id, status").eq("invoice_id", String(invoiceId)).eq("buyer_id", user.id).maybeSingle();
  if (!t) return fail("That purchase wasn't found.", 404);
  if (t.status === "complete") return fail("The transfer is already done.");
  const path = `${t.invoice_id}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await supabaseAdmin().storage.from("transfer-docs").createSignedUploadUrl(path);
  if (error || !data) return fail("Couldn't start the upload. Please try again.", 500);
  return json({ path, signedUrl: data.signedUrl, token: data.token });
}
