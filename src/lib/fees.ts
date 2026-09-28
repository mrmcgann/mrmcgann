import type { Fees } from "@/lib/types";

// Mirrors public.price_breakdown() in the database. Used for the live all-in preview.
export function priceBreakdown(price: number, f: Fees) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const premium = r2(price * f.premium_rate);
  const gst = r2(premium * 0.1);
  const subtotal = price + premium + gst + f.admin_fee;
  const mode: "card" | "deposit" = subtotal < f.card_limit ? "card" : "deposit";
  const cardBase = mode === "card" ? subtotal : subtotal < f.nrd_split ? f.nrd_low : f.nrd_high;
  const surcharge = r2(cardBase * f.surcharge_rate);
  return {
    price, premium, gst, adminFee: f.admin_fee, subtotal, mode, cardBase, surcharge,
    cardAmount: cardBase + surcharge, balanceDue: subtotal - cardBase, total: subtotal + surcharge,
  };
}
