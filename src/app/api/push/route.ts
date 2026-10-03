import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";

const TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{10,200}\]$/;

// The app registers its push token after sign-in (and on each launch, to keep it fresh).
export async function POST(req: Request) {
  const { token, platform, version } = await req.json().catch(() => ({}));
  const user = await currentUser(await supabaseServer());
  if (!user) return fail("Sign in first.", 401);
  if (typeof token !== "string" || !TOKEN.test(token)) return fail("That isn't a valid push token.");
  if (platform !== "ios" && platform !== "android") return fail("Unknown platform.");
  const { error } = await supabaseAdmin().rpc("register_push_device", { p_user: user.id, p_token: token, p_platform: platform, p_version: String(version || "").slice(0, 20) });
  if (error) return fail("Couldn't turn on notifications. Please try again.");
  return json({ ok: true });
}

// Signing out of the app stops alerts to that phone.
export async function DELETE(req: Request) {
  const { token } = await req.json().catch(() => ({}));
  const user = await currentUser(await supabaseServer());
  if (!user) return fail("Sign in first.", 401);
  if (typeof token !== "string" || !TOKEN.test(token)) return json({ ok: true });
  await supabaseAdmin().from("push_devices").delete().eq("token", token).eq("user_id", user.id);
  return json({ ok: true });
}
