import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { allow } from "@/lib/ratelimit";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

// "Ask a question": goes to Tyrebiter (who checks with the seller), never straight to the seller.
export async function POST(req: Request) {
  const { lotId, question } = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in to ask a question.", 401);
  const q = String(question || "").trim().slice(0, 600);
  if (q.length < 8) return fail("Please write a little more.");
  if (!(await allow(`question:${user.id}`, 10, 3600))) return fail("You've asked a lot of questions in the last hour. Please try again later.", 429);
  const admin = supabaseAdmin();
  const { data: lot } = await admin.from("lots").select("title, status").eq("id", Number(lotId)).maybeSingle();
  if (!lot || lot.status === "draft") return fail("We couldn't find that vehicle.", 404);
  const { error } = await admin.from("lot_questions").insert({ lot_id: Number(lotId), user_id: user.id, question: q });
  if (error) return fail("Couldn't send your question.");
  await sendEmail({ to: env.supportEmail, subject: `Question on lot ${lotId}: ${lot.title}`, text: `${q}\n\nAnswer it in admin: ${env.siteUrl}/admin/questions` }).catch(() => undefined);
  return json({ ok: true });
}
