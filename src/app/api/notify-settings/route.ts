import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { userFromToken } from "@/lib/links";
import { json, fail } from "@/lib/api";

// Signed in, or from the "manage alerts" link in an email or SMS (no sign-in needed).
export async function POST(req: Request) {
  const { notify } = await req.json().catch(() => ({}));
  const token = new URL(req.url).searchParams.get("t");
  const userId = token ? userFromToken(token) : (await currentUser(await supabaseServer()))?.id;
  if (!userId) return fail("Sign in first.", 401);
  const keys = ["outbid", "ending", "won", "searches", "marketing"];
  const clean = Object.fromEntries(keys.map((k) => [k, { sms: !!notify?.[k]?.sms, email: !!notify?.[k]?.email }]));
  await supabaseAdmin().from("profiles").update({ notify: clean }).eq("id", userId);
  return json({ ok: true });
}
