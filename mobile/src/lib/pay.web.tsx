import type { ReactNode } from "react";

// The web build is for testing: in test mode the server saves a test card without Stripe.
export function PayProvider({ children }: { children: ReactNode }) { return <>{children}</>; }
export type PayResult = { ok: true } | { cancelled: true } | { error: string };
export function usePayments() {
  const unavailable = async (_s: string): Promise<PayResult> => ({ error: "Card entry opens in the Tyrebiter app." });
  return { saveCard: unavailable, pay: unavailable };
}
