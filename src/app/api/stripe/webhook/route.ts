import { getStripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { syncIdentity } from "@/lib/identity";
import { env } from "@/lib/env";

export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe || !env.stripeWebhookSecret) return new Response("Not configured", { status: 400 });
  const body = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, req.headers.get("stripe-signature") || "", env.stripeWebhookSecret);
  } catch {
    return new Response("Bad signature", { status: 400 });
  }
  const db = supabaseAdmin();
  switch (event.type) {
    case "identity.verification_session.verified":
    case "identity.verification_session.requires_input":
    case "identity.verification_session.canceled":
      await syncIdentity((event.data.object as { id: string }).id);
      break;
    case "payment_intent.succeeded": {
      const pi = event.data.object as { id: string; metadata: Record<string, string> };
      if (pi.metadata?.kind === "retry" && pi.metadata.invoice_id) {
        const { data: inv } = await db.from("invoices").select("mode, status").eq("id", pi.metadata.invoice_id).single();
        if (inv?.status === "payment_failed") {
          await db.from("invoices").update({ status: inv.mode === "card" ? "paid" : "deposit_paid", paid_at: new Date().toISOString(), stripe_payment_intent: pi.id, failure_reason: null }).eq("id", pi.metadata.invoice_id);
        }
      }
      break;
    }
  }
  return new Response("ok");
}
