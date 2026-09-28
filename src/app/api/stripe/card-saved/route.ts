import { getSession } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { json, fail } from "@/lib/api";

export async function POST(req: Request) {
  const { setupIntentId } = await req.json();
  const { user } = await getSession();
  const stripe = getStripe();
  if (!user || !stripe) return fail("Sign in first.", 401);
  const si = await stripe.setupIntents.retrieve(setupIntentId, { expand: ["payment_method"] });
  if (si.metadata?.user_id !== user.id || si.status !== "succeeded") return fail("We couldn't confirm that card. Please try again.");
  const pm = si.payment_method as { id: string; card?: { brand: string; last4: string } };
  await stripe.customers.update(si.customer as string, { invoice_settings: { default_payment_method: pm.id } });
  const brand = pm.card?.brand ? pm.card.brand[0].toUpperCase() + pm.card.brand.slice(1) : "Card";
  await supabaseAdmin().from("profiles").update({ payment_method_id: pm.id, card_brand: brand, card_last4: pm.card?.last4 || "" }).eq("id", user.id);
  return json({ brand, last4: pm.card?.last4 });
}
