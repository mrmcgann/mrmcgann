import { supabaseServer } from "@/lib/supabase/server";
import { json, fail } from "@/lib/api";

export async function POST(req: Request) {
  const { notify } = await req.json();
  const db = await supabaseServer();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return fail("Sign in first.", 401);
  const keys = ["outbid", "ending", "won", "searches", "marketing"];
  const clean = Object.fromEntries(keys.map((k) => [k, { sms: !!notify?.[k]?.sms, email: !!notify?.[k]?.email }]));
  await db.from("profiles").update({ notify: clean }).eq("id", user.id);
  return json({ ok: true });
}
