import { revalidateTag } from "next/cache";
import { adminApi, audit } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";

// Staff upload the mechanic's report (a PDF) for an inspected listing. Stored privately; members read it through
// /api/lots/[id]/inspection-report.
export async function POST(req: Request) {
  const { s, error } = await adminApi();
  if (error) return error;
  const form = await req.formData().catch(() => null);
  const lotId = Number(form?.get("lotId"));
  const file = form?.get("file");
  if (!Number.isInteger(lotId) || lotId <= 0 || !(file instanceof File)) return fail("Choose a PDF.");
  if (file.size > 15 * 1024 * 1024) return fail("The report must be 15 MB or less.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return fail("That isn't a PDF. Save the report as a PDF and try again.");
  const db = supabaseAdmin();
  const { data: lot } = await db.from("lots").select("id").eq("id", lotId).maybeSingle();
  if (!lot) return fail("We couldn't find that vehicle.", 404);
  const path = `${lotId}/report-${Date.now()}.pdf`;
  const up = await db.storage.from("inspection-reports").upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (up.error) return fail("Couldn't store the report. Please try again.");
  const { data: old } = await db.from("lot_private").select("inspection_report_path").eq("lot_id", lotId).maybeSingle();
  await db.from("lot_private").upsert({ lot_id: lotId, inspection_report_path: path });
  if (old?.inspection_report_path) await db.storage.from("inspection-reports").remove([old.inspection_report_path]).catch(() => undefined);
  revalidateTag(`lot-${lotId}`);
  await audit(s.user?.id, "inspection report", `lot:${lotId}`, { size: file.size }, "ok");
  return json({ ok: true });
}
