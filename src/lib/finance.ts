// Repayment maths for the finance calculator and the "Est. $X/wk" line on listings.
// Shared by the website and the app, so keep it free of Next- or Node-only imports.
import type { FinanceSettings, Partner } from "./types";

export type Frequency = "weekly" | "fortnightly" | "monthly";
export const PERIODS: Record<Frequency, number> = { weekly: 52, fortnightly: 26, monthly: 12 };
export const FREQ_LABEL: Record<Frequency, string> = { weekly: "week", fortnightly: "fortnight", monthly: "month" };

/** Repayment per period for a loan with an optional balloon (final lump sum). Rate is % p.a. */
export function repayment(amount: number, ratePct: number, months: number, freq: Frequency = "weekly", balloon = 0): number {
  const n = Math.max(1, Math.round((months / 12) * PERIODS[freq]));
  const L = Math.max(0, amount), B = Math.min(Math.max(0, balloon), L);
  if (L === 0) return 0;
  const r = ratePct / 100 / PERIODS[freq];
  if (r === 0) return (L - B) / n;
  const f = Math.pow(1 + r, n);
  return ((L - B / f) * r) / (1 - 1 / f);
}

export interface LoanResult { perPeriod: number; periods: number; totalPaid: number; totalInterest: number; fees: number }
/** Totals including the partner's establishment and monthly fees. */
export function loan(amount: number, ratePct: number, months: number, freq: Frequency, balloon = 0, estFee = 0, monthlyFee = 0): LoanResult {
  const periods = Math.max(1, Math.round((months / 12) * PERIODS[freq]));
  const perPeriod = repayment(amount, ratePct, months, freq, balloon);
  const fees = (estFee || 0) + (monthlyFee || 0) * months;
  const totalPaid = perPeriod * periods + Math.min(balloon, amount) + fees;
  return { perPeriod, periods, totalPaid, totalInterest: Math.max(0, totalPaid - amount - fees), fees };
}

/** The finance partner whose advertised rate a listing estimate is based on (lowest "from" rate). */
export function estimatePartner(partners: Partner[], amount: number): Partner | null {
  const ok = partners.filter((p) => p.kind === "finance" && p.active && p.rate_from != null && p.comparison_rate != null
    && (p.min_amount == null || amount >= p.min_amount) && (p.max_amount == null || amount <= p.max_amount));
  return ok.sort((a, b) => (a.rate_from as number) - (b.rate_from as number))[0] || null;
}

/** "Est. $X/wk" for a listing, or null when it shouldn't show (no partner, too cheap, switched off).
 *  `price` should be the all-in price (bid plus premium, GST and fees). The estimate uses the lowest
 *  advertised rate among the lenders we compare, without naming or recommending one. */
export function listingEstimate(price: number, partners: Partner[], s: FinanceSettings = {}) {
  if (s.show_on_listings === false || !price || price < (s.min_price ?? 3000)) return null;
  const amount = Math.round(price * (1 - (s.deposit_pct ?? 0) / 100));
  const p = estimatePartner(partners, amount);
  if (!p || !p.comparison_basis) return null;
  const months = s.term_months ?? 60;
  return { weekly: repayment(amount, p.rate_from as number, months, "weekly"), amount, months, rate: p.rate_from as number, comparison: p.comparison_rate as number, basis: p.comparison_basis, partner: p };
}

/** Fill a partner's referral link template: {amount} {term} {lot} {make} {model} {year} {postcode}. */
export function fillReferral(template: string, v: Record<string, string | number | null | undefined>) {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => encodeURIComponent(v[k] == null ? "" : String(v[k])));
}

// The warning the National Credit Code requires wherever a comparison rate is shown. [LAWYER TO CONFIRM CURRENT WORDING]
export const COMPARISON_WARNING = "WARNING: This comparison rate is true only for the examples given and may not include all fees and charges. Different terms, fees or other loan amounts might result in a different comparison rate.";

// Insurance features shown side by side. Facts from each insurer, never a rating or recommendation.
export const INSURANCE_FEATURES: [string, string][] = [
  ["agreed_value", "Agreed or market value"], ["new_car_replacement", "New car replacement"], ["choice_of_repairer", "Choice of repairer"],
  ["hire_car", "Hire car"], ["excess_from", "Basic excess from"], ["monthly_payments", "Pay monthly"], ["roadside", "Roadside assistance"],
];
