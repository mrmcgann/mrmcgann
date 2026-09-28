import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { checkVerification } from "@/lib/sms";

export async function POST(req: Request) {
  const { code } = await req.json();
  const { user, profile } = await getSession();
  if (!user || !profile?.mobile) return fail("Sign in first.", 401);
  const clean = String(code || "").replace(/\D/g, "");
  if (clean.length !== 6) return fail("Enter all 6 digits.");
  const ok = await checkVerification(profile.mobile, clean);
  if (!ok) return fail("That code doesn't match. Check the SMS or send a new code.");
  await supabaseAdmin().from("profiles").update({ mobile_verified: true }).eq("id", user.id);
  return json({ ok: true });
}
