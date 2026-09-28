import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { json, fail } from "@/lib/api";
import { env } from "@/lib/env";

// Starts saving a card for automatic charging when the member wins.
export async function POST() {
  const { user, profile } = await getSession();
  if (!user || !profile) return fail("Sign in first.", 401);
  const stripe = getStripe();
  const admin = supabaseAdmin();
  if (!stripe) {
    if (!env.testMode) return fail("Card payments aren't set up yet.");
    await admin.from("profiles").update({ payment_method_id: "test_card", card_brand: "Visa", card_last4: "4242" }).eq("id", user.id);
    return json({ test: true });
  }
  let customer = (profile as unknown as { stripe_customer_id?: string }).stripe_customer_id;
  if (!customer) {
    const c = await stripe.customers.create({
      email: user.email, name: `${profile.first_name || ""} ${profile.last_name || ""}`.trim(), phone: profile.mobile || undefined,
      metadata: { user_id: user.id },
    });
    customer = c.id;
    await admin.from("profiles").update({ stripe_customer_id: customer }).eq("id", user.id);
  }
  const si = await stripe.setupIntents.create({ customer, usage: "off_session", payment_method_types: ["card"], metadata: { user_id: user.id } });
  return json({ clientSecret: si.client_secret });
}
