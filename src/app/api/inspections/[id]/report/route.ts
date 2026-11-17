import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fail } from "@/lib/api";
import { allow } from "@/lib/ratelimit";

// The mechanic's report for the member who booked it (or staff): a link that works for 5 minutes. Row-level security
// decides who can read the booking, so another member's id finds nothing. ?json=1 returns the link for the app.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return fail("We couldn't find that report.", 404);
  const url = new URL(req.url);
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return NextResponse.redirect(new URL(`/signin?next=${encodeURIComponent("/account")}`, req.url));
  if (!(await allow(`mreport:${user.id}`, 60, 3600))) return fail("Too many reports opened. Try again in a while.", 429);
  const { data: row } = await db.from("mechanic_inspections").select("status, report_path").eq("id", id).maybeSingle();
  if (!row || row.status !== "done" || !row.report_path) return fail("There's no report for that booking yet.", 404);
  const { data } = await supabaseAdmin().storage.from("inspection-reports").createSignedUrl(row.report_path, 300);
  if (!data?.signedUrl) return fail("The report isn't available right now. Please try again.", 503);
  if (url.searchParams.get("json") === "1") return NextResponse.json({ url: data.signedUrl });
  return NextResponse.redirect(data.signedUrl);
}
