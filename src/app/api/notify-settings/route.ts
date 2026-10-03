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
  // "push" (the apps) is kept only when sent, so a website save doesn't switch app alerts off
  const clean: Record<string, { sms: boolean; email: boolean; push?: boolean }> = Object.fromEntries(keys.map((k) => [k, { sms: !!notify?.[k]?.sms, email: !!notify?.[k]?.email, ...(typeof notify?.[k]?.push === "boolean" ? { push: notify[k].push } : {}) }]));
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("profiles").select("notify").eq("id", userId).single();
  const prev = (cur?.notify || {}) as Record<string, { push?: boolean }>;
  for (const k of keys) if (clean[k].push === undefined && typeof prev[k]?.push === "boolean") clean[k] = { ...clean[k], push: prev[k].push };
  await admin.from("profiles").update({ notify: clean }).eq("id", userId);
  return json({ ok: true });
}
