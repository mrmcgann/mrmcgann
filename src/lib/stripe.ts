import "server-only";
import Stripe from "stripe";
import { env } from "@/lib/env";

let stripe: Stripe | null = null;
export function getStripe() {
  if (!env.stripeSecret) return null;
  if (!stripe) stripe = new Stripe(env.stripeSecret);
  return stripe;
}
export const cents = (n: number) => Math.round(Number(n) * 100);
