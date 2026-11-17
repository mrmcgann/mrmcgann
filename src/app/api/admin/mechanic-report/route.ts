import { adminApi, audit } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";

// Staff upload the mobile mechanic's report (a PDF) for a booking. Stored privately under bookings/<id>/; the member who
// booked it opens it through /api/inspections/[id]/report. Closing the booking (admin action 'inspection', do 'done')
// takes the path this returns, with the findings and the tick that they're on the listing.
export async function POST(req: Request) {
  const { s, error } = await adminApi();
  if (error) return error;
  const form = await req.formData().catch(() => null);
  const id = String(form?.get("id") || "");
  const file = form?.get("file");
  if (!/^[0-9a-f-]{36}$/.test(id) || !(file instanceof File)) return fail("Choose a PDF.");
  if (file.size > 15 * 1024 * 1024) return fail("The report must be 15 MB or less.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-") return fail("That isn't a PDF. Save the report as a PDF and try again.");
  const db = supabaseAdmin();
  const { data: row } = await db.from("mechanic_inspections").select("id, status").eq("id", id).maybeSingle();
  if (!row) return fail("We couldn't find that booking.", 404);
  if (row.status !== "paid") return fail("Upload the report once the booking is paid and the mechanic has been.");
  const path = `bookings/${id}/report-${Date.now()}.pdf`;
  const up = await db.storage.from("inspection-reports").upload(path, bytes, { contentType: "application/pdf", upsert: false });
  if (up.error) return fail("Couldn't store the report. Please try again.");
  await audit(s.user?.id, "mechanic report", `inspection:${id}`, { size: file.size }, "ok");
  return json({ ok: true, path });
}
