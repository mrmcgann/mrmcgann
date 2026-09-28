import { supabaseAdmin } from "@/lib/supabase/admin";
import { userFromToken } from "@/lib/links";

// One-click unsubscribe (RFC 8058) from optional alerts: marketing, saved searches, reminders.
export async function POST(req: Request) {
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  const token = url.searchParams.get("t") || String(form?.get("t") || "");
  const userId = userFromToken(token);
  if (!userId) return new Response("Invalid link", { status: 400 });
  const db = supabaseAdmin();
  const { data: p } = await db.from("profiles").select("notify").eq("id", userId).single();
  const n = { ...(p?.notify || {}) };
  for (const k of ["marketing", "searches", "ending"]) n[k] = { sms: false, email: false };
  await db.from("profiles").update({ notify: n }).eq("id", userId);
  // Mail apps' one-click unsubscribe expects a plain 200; people clicking the button get a page.
  if (form?.get("List-Unsubscribe")) return new Response("Unsubscribed", { status: 200 });
  return Response.redirect(new URL(`/u/${encodeURIComponent(token)}?done=1`, req.url), 303);
}
