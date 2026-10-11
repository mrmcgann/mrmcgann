import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail } from "@/lib/api";
import { allow } from "@/lib/ratelimit";

// The mechanic's report on an inspected listing: signed-in members only, through a link that works for 5 minutes
// (the report can show the VIN, which never goes on public pages).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return NextResponse.redirect(new URL(`/signin?next=${encodeURIComponent(`/lot/${id}#inspected`)}`, req.url));
  if (!(await allow(`report:${user.id}`, 60, 3600))) return fail("Too many reports opened. Try again in a while.", 429);
  const admin = supabaseAdmin();
  const [{ data: lot }, { data: pr }] = await Promise.all([
    admin.from("lots").select("status, inspected_at").eq("id", id).maybeSingle(),
    admin.from("lot_private").select("inspection_report_path").eq("lot_id", id).maybeSingle(),
  ]);
  if (!lot || lot.status === "draft" || !lot.inspected_at || !pr?.inspection_report_path) return fail("There's no report for this vehicle.", 404);
  const { data } = await admin.storage.from("inspection-reports").createSignedUrl(pr.inspection_report_path, 300);
  if (!data?.signedUrl) return fail("The report isn't available right now. Please try again.", 503);
  return NextResponse.redirect(data.signedUrl);
}
