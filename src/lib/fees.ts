import type { Fees } from "@/lib/types";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** How money is taken (Admin → Fees & settings). "transfer" (the default, like Turners): bid with a verified ID, pay the
 *  whole amount by PayID or bank transfer after winning. "deposit": a refundable bidding deposit first. "card": the old way. */
export type PayMode = "transfer" | "deposit" | "card";
export const payMode = (f: Pick<Fees, "pay_mode">): PayMode => (f.pay_mode === "card" ? "card" : f.pay_mode === "deposit" ? "deposit" : "transfer");

/** The bidding deposit needed to bid, buy or offer an amount. Mirrors public.deposit_for_with(). */
export function depositFor(amount: number, f: Fees): number {
  if (!(amount > 0)) return 0;
  const rate = f.deposit_rate ?? 0.1, min = f.deposit_min ?? 500, cap = f.deposit_cap ?? 0;
  const need = Math.max(min, Math.ceil(amount * rate));
  return cap > 0 ? Math.min(need, cap) : need;
}

/** The most someone can bid with this much free deposit (null = no limit). Mirrors public.deposit_summary(). */
export function bidLimit(available: number, f: Fees): number | null {
  const rate = f.deposit_rate ?? 0.1, min = f.deposit_min ?? 500, cap = f.deposit_cap ?? 0;
  if (cap > 0 && available >= cap) return null;
  if (available < min || rate <= 0) return 0;
  return Math.floor(available / rate);
}

/** The deposit to pay for a bid limit the bidder chooses (at the cap there's no limit at all). */
export const depositForLimit = (limit: number, f: Fees) => depositFor(limit, f);

// Mirrors public.price_breakdown() in the database. Used for the live all-in preview.
// With deposits, cardAmount is the part that comes from the bidding deposit; balanceDue is paid by transfer
// (with "transfer", that's everything).
export function priceBreakdown(price: number, f: Fees) {
  const premium = r2(price * f.premium_rate);
  const gst = r2(premium * 0.1);
  const subtotal = price + premium + gst + f.admin_fee;
  const pm = payMode(f);
  if (pm === "transfer") {
    return {
      price, premium, gst, adminFee: f.admin_fee, subtotal, mode: "deposit" as "card" | "deposit", cardBase: 0, surcharge: 0,
      cardAmount: 0, balanceDue: subtotal, total: subtotal, payMode: "transfer" as PayMode,
    };
  }
  if (pm === "deposit") {
    const fromDeposit = Math.min(depositFor(price, f), subtotal);
    return {
      price, premium, gst, adminFee: f.admin_fee, subtotal, mode: "deposit" as "card" | "deposit", cardBase: fromDeposit, surcharge: 0,
      cardAmount: fromDeposit, balanceDue: r2(subtotal - fromDeposit), total: subtotal, payMode: "deposit" as PayMode,
    };
  }
  const mode: "card" | "deposit" = subtotal < f.card_limit ? "card" : "deposit";
  const cardBase = mode === "card" ? subtotal : subtotal < f.nrd_split ? f.nrd_low : f.nrd_high;
  const surcharge = r2(cardBase * f.surcharge_rate);
  return {
    price, premium, gst, adminFee: f.admin_fee, subtotal, mode, cardBase, surcharge,
    cardAmount: cardBase + surcharge, balanceDue: subtotal - cardBase, total: subtotal + surcharge, payMode: "card" as PayMode,
  };
}

// How money is taken is the same for every vehicle; only the fees are locked per vehicle.
const GLOBAL_KEYS = new Set(["pay_mode", "deposit_rate", "deposit_min", "deposit_cap"]);

/** The fees locked on a vehicle when it went live (lots.fees), over today's fees. A fee change never applies to a
 *  vehicle already listed, so every price shown for it uses these. Mirrors public.lot_price_breakdown(). */
export function lotFees(f: Fees, lot?: { fees?: Partial<Record<keyof Fees, number | string>> | null } | null): Fees {
  if (!lot?.fees) return f;
  const out = { ...f } as Record<string, number | string>;
  for (const [k, v] of Object.entries(lot.fees)) {
    if (GLOBAL_KEYS.has(k)) continue;
    if (k in out && v !== null && v !== "" && Number.isFinite(Number(v))) out[k] = Number(v);
  }
  return out as unknown as Fees;
}
