import { getSession, missingSteps } from "@/lib/auth";
import { json } from "@/lib/api";
import { env, has } from "@/lib/env";

export async function GET() {
  const { user, profile } = await getSession();
  return json({
    user: user ? { id: user.id, email: user.email } : null,
    profile,
    missing: user ? missingSteps(profile) : [1, 2, 3, 4, 5],
    config: { stripe: has.stripe && Boolean(env.stripePublishable), testMode: env.testMode, sms: has.twilioVerify },
  });
}
