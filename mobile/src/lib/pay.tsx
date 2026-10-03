import type { ReactNode } from "react";
import { StripeProvider, useStripe } from "@stripe/stripe-react-native";
import { STRIPE_PK } from "./env";

// Cards are entered in Stripe's own payment sheet: Tyrebiter never sees the card number.
// Buying a vehicle is a physical-goods purchase, so App Store in-app purchase doesn't apply.
export function PayProvider({ children }: { children: ReactNode }) {
  if (!STRIPE_PK) return <>{children}</>;
  return (
    <StripeProvider publishableKey={STRIPE_PK} urlScheme="tyrebiter">
      <>{children}</>
    </StripeProvider>
  );
}

export type PayResult = { ok: true } | { cancelled: true } | { error: string };

export function usePayments() {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  async function run(intent: { setupIntentClientSecret: string } | { paymentIntentClientSecret: string }): Promise<PayResult> {
    const init = await initPaymentSheet({
      ...intent,
      merchantDisplayName: "Tyrebiter",
      returnURL: "tyrebiter://stripe-redirect",
      appearance: { colors: { primary: "#2F5BFF" }, shapes: { borderRadius: 14 } },
    });
    if (init.error) return { error: init.error.message };
    const r = await presentPaymentSheet();
    if (r.error) return r.error.code === "Canceled" ? { cancelled: true } : { error: r.error.message };
    return { ok: true };
  }
  return {
    saveCard: (clientSecret: string) => run({ setupIntentClientSecret: clientSecret }),
    pay: (clientSecret: string) => run({ paymentIntentClientSecret: clientSecret }),
  };
}
