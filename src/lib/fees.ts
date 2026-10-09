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

/** The fees locked on a vehicle when it went live (lots.fees), over today's fees. A fee change never applies to a
 *  vehicle already listed, so every price shown for it uses these. Mirrors public.lot_price_breakdown(). */
export function lotFees(f: Fees, lot?: { fees?: Partial<Record<keyof Fees, number | string>> | null } | null): Fees {
  if (!lot?.fees) return f;
  const out = { ...f } as Record<string, number>;
  for (const [k, v] of Object.entries(lot.fees)) if (k in out && v !== null && v !== "" && Number.isFinite(Number(v))) out[k] = Number(v);
  return out as unknown as Fees;
}
