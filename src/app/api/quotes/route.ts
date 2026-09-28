import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { allow, clientIp } from "@/lib/ratelimit";

export async function POST(req: Request) {
  const { lotId, postcode, email } = await req.json();
  if (!/^\d{4}$/.test(String(postcode || ""))) return fail("Enter a 4-digit postcode.");
  if (!/^\S+@\S+\.\S+$/.test(String(email || ""))) return fail("Enter your email so we can send the quote.");
  if (!(await allow(`quote:${await clientIp()}`, 10, 3600))) return fail("Too many requests. Please try again later.", 429);
  const db = await supabaseServer();
  const user = await currentUser(db);
  const admin = supabaseAdmin();
  const { data: lot } = await admin.from("lots").select("title, suburb, state").eq("id", lotId).single();
  const { error } = await admin.from("quote_requests").insert({ lot_id: lotId, user_id: user?.id || null, postcode, email });
  if (error) return fail("We couldn't send that. Please try again.");
  await sendEmail({ to: env.supportEmail, subject: `Transport quote: ${lot?.title} to ${postcode}`, text: `From ${lot?.suburb} ${lot?.state} to ${postcode}. Reply to ${email}.\n${env.siteUrl}/admin/quotes` }).catch(() => {});
  return json({ ok: true });
}
