import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  const { lotId, postcode, email } = await req.json();
  if (!/^\d{4}$/.test(String(postcode || ""))) return fail("Enter a 4-digit postcode.");
  if (!/^\S+@\S+\.\S+$/.test(String(email || ""))) return fail("Enter your email so we can send the quote.");
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  const admin = supabaseAdmin();
  const { data: lot } = await admin.from("lots").select("title, suburb, state").eq("id", lotId).single();
  const { error } = await admin.from("quote_requests").insert({ lot_id: lotId, user_id: user?.id || null, postcode, email });
  if (error) return fail("We couldn't send that. Please try again.");
  await sendEmail(env.supportEmail, `Transport quote: ${lot?.title} to ${postcode}`, `From ${lot?.suburb} ${lot?.state} to ${postcode}. Reply to ${email}.\n${env.siteUrl}/admin/quotes`).catch(() => {});
  return json({ ok: true });
}
