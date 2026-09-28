import { getSession } from "@/lib/auth";
import { json, fail } from "@/lib/api";
import { startVerification } from "@/lib/sms";
import { allow, clientIp } from "@/lib/ratelimit";

export async function POST() {
  const { user, profile } = await getSession();
  if (!user || !profile) return fail("Sign in first.", 401);
  if (!profile.mobile) return fail("Add your mobile number first.");
  // SMS pumping protection: limit codes per person, per number and per network address
  const mobile = profile.mobile.replace(/\D/g, "");
  const ok = (await allow(`sms:user:${user.id}`, 5, 3600)) && (await allow(`sms:to:${mobile}`, 5, 3600)) && (await allow(`sms:ip:${await clientIp()}`, 20, 3600));
  if (!ok) return fail("Too many codes requested. Please wait an hour, or call us.", 429);
  try {
    const r = await startVerification(profile.mobile);
    return json({ ok: true, test: r.test });
  } catch (e) {
    return fail((e as Error).message);
  }
}
