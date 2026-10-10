import { getStripe } from "@/lib/stripe";
import { syncIdentity } from "@/lib/identity";
import { markInvoicePaid } from "@/lib/charges";
import { env } from "@/lib/env";
import { mark } from "@/lib/health";

export async function POST(req: Request) {
  const stripe = getStripe();
  if (!stripe || !env.stripeWebhookSecret) return new Response("Not configured", { status: 400 });
  const body = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, req.headers.get("stripe-signature") || "", env.stripeWebhookSecret);
  } catch {
    // Anyone can post here, so one bad signature isn't an error. Site health warns if Stripe's own messages keep
    // being turned away (usually STRIPE_WEBHOOK_SECRET isn't the endpoint's signing secret).
    await mark("stripe_webhook_bad");
    return new Response("Bad signature", { status: 400 });
  }
  await mark("stripe_webhook", { type: event.type });
  switch (event.type) {
    case "identity.verification_session.verified":
    case "identity.verification_session.requires_input":
    case "identity.verification_session.canceled":
      await syncIdentity((event.data.object as { id: string }).id);
      break;
    case "payment_intent.succeeded": {
      // Any successful payment for an invoice (the automatic charge, a pay-now, or one that was "processing").
      const pi = event.data.object as { id: string; metadata: Record<string, string> };
      if (pi.metadata?.invoice_id && pi.metadata.kind !== "cancel_fee") await markInvoicePaid(pi.metadata.invoice_id, pi.id);
      break;
    }
  }
  return new Response("ok");
}
