import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { name, mobile } = await req.json();
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return fail("Sign in first.", 401);
  if (!String(name || "").trim()) return fail("Enter their full name.");
  const { data: inv } = await db.from("invoices").select("id").eq("id", id).eq("buyer_id", user.id).single();
  if (!inv) return fail("Invoice not found.", 404);
  await supabaseAdmin().from("invoices").update({ collector_name: String(name).trim(), collector_mobile: String(mobile || "").trim() || null }).eq("id", id);
  return json({ ok: true });
}
