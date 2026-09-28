import { getSession } from "@/lib/auth";
import { json, fail } from "@/lib/api";
import { startVerification } from "@/lib/sms";

export async function POST() {
  const { user, profile } = await getSession();
  if (!user || !profile) return fail("Sign in first.", 401);
  if (!profile.mobile) return fail("Add your mobile number first.");
  try {
    const r = await startVerification(profile.mobile);
    return json({ ok: true, test: r.test });
  } catch (e) {
    return fail((e as Error).message);
  }
}
