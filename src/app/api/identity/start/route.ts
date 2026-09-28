import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { json, fail } from "@/lib/api";
import { env } from "@/lib/env";

// ID check via Stripe Identity: photo of licence or passport plus a selfie.
export async function POST() {
  const { user, profile } = await getSession();
  if (!user || !profile) return fail("Sign in first.", 401);
  if (!profile.details_done) return fail("Add your details first.");
  const admin = supabaseAdmin();
  const stripe = getStripe();
  if (!stripe) {
    if (!env.testMode) return fail("ID checks aren't set up yet.");
    await admin.from("profiles").update({ id_status: "verified" }).eq("id", user.id);
    return json({ test: true });
  }
  const s = await stripe.identity.verificationSessions.create({
    type: "document",
    options: { document: { allowed_types: ["driving_license", "passport"], require_matching_selfie: true, require_live_capture: true } },
    provided_details: { email: user.email || undefined },
    metadata: { user_id: user.id },
    return_url: `${env.siteUrl}/join?step=5&identity=return`,
  });
  await admin.from("profiles").update({ id_status: "pending", id_session_id: s.id }).eq("id", user.id);
  return json({ url: s.url });
}
