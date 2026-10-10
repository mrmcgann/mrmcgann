// The business metrics: what each number means and how it's worked out from the daily metric store
// (public.metric_values, filled by compute_daily_metrics()). Pure: used by the dashboard, the insights
// engine, the briefing email and the unit tests.

export type Fmt = "count" | "money" | "pct" | "hours" | "days" | "ratio";
/** Totals over a period: "metric" or "metric|dim" → summed value; latest values for stock levels. */
export type Totals = { sum: Record<string, number>; latest: Record<string, number> };
export type Get = (metric: string, dim?: string) => number;

export interface Kpi {
  key: string;
  label: string;
  group: "Sales" | "Money" | "Buyers" | "After the sale" | "Sellers" | "Marketing";
  fmt: Fmt;
  /** Which way is good: an increase in "up" metrics is good news, in "down" metrics bad news. */
  good: "up" | "down" | "neutral";
  hint: string;
  calc: (g: Get, latest: Get) => number | null;
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

export const KPIS: Kpi[] = [
  // Sales
  { key: "gmv", label: "Vehicle sales", group: "Sales", fmt: "money", good: "up", hint: "Hammer prices of vehicles sold (not counting sales later cancelled).", calc: (g) => g("gmv") },
  { key: "sales", label: "Vehicles sold", group: "Sales", fmt: "count", good: "up", hint: "Auction wins, accepted referrals and offers, and Buy Now.", calc: (g) => g("sales") },
  { key: "avg_sale", label: "Average sale price", group: "Sales", fmt: "money", good: "neutral", hint: "Vehicle sales divided by vehicles sold.", calc: (g) => div(g("gmv"), g("sales")) },
  { key: "sell_through", label: "Sell-through", group: "Sales", fmt: "pct", good: "up", hint: "Vehicles sold as a share of auctions that closed.", calc: (g) => { const r = div(g("sales"), g("lots_closed")); return r == null ? null : Math.min(r, 1); } },
  { key: "bids_per_lot", label: "Bids per vehicle", group: "Sales", fmt: "ratio", good: "up", hint: "Bids on each auction that closed.", calc: (g) => div(g("bids_on_closed"), g("lots_closed")) },
  { key: "no_bid_rate", label: "Closed with no bids", group: "Sales", fmt: "pct", good: "down", hint: "Auctions that closed without a single bid.", calc: (g) => div(g("lots_closed_no_bids"), g("lots_closed")) },
  { key: "reserve_met_rate", label: "Reserve met", group: "Sales", fmt: "pct", good: "up", hint: "Auctions with bids that met the reserve (or had none).", calc: (g) => div(g("lots_closed_reserve_met"), g("lots_closed") - g("lots_closed_no_bids")) },
  { key: "lots_published", label: "New listings", group: "Sales", fmt: "count", good: "up", hint: "Vehicles that went live.", calc: (g) => g("lots_published") },
  { key: "live_lots", label: "Live now", group: "Sales", fmt: "count", good: "up", hint: "Auctions open right now.", calc: (_g, l) => l("live_lots") },
  // Money
  { key: "revenue", label: "Tyrebiter revenue", group: "Money", fmt: "money", good: "up", hint: "Buyer's premium and admin fees (ex GST), seller fees, and our half of forfeited deposits.", calc: (g) => g("revenue") },
  { key: "take_rate", label: "Take rate", group: "Money", fmt: "pct", good: "up", hint: "Revenue as a share of vehicle sales.", calc: (g) => div(g("revenue"), g("gmv")) },
  { key: "premium", label: "Buyer's premium", group: "Money", fmt: "money", good: "up", hint: "Ex GST.", calc: (g) => g("premium") },
  { key: "admin_fees", label: "Admin fees", group: "Money", fmt: "money", good: "up", hint: "Ex GST.", calc: (g) => g("admin_fees") },
  { key: "seller_fees", label: "Seller fees", group: "Money", fmt: "money", good: "up", hint: "Ex GST.", calc: (g) => g("seller_fees") },
  { key: "refunds_amount", label: "Refunded to buyers", group: "Money", fmt: "money", good: "down", hint: "Sales cancelled and refunded (not the buyer's fault).", calc: (g) => g("refunds_amount") },
  // Buyers
  { key: "visitors", label: "Visitors", group: "Buyers", fmt: "count", good: "up", hint: "Different people a day, added up (website and app).", calc: (g) => g("visitors") },
  { key: "views", label: "Page views", group: "Buyers", fmt: "count", good: "up", hint: "Pages and app screens viewed.", calc: (g) => g("views") },
  { key: "signups", label: "New members", group: "Buyers", fmt: "count", good: "up", hint: "Accounts created.", calc: (g) => g("signups") },
  { key: "signup_rate", label: "Visitors who join", group: "Buyers", fmt: "pct", good: "up", hint: "New members per visitor.", calc: (g) => { const r = div(g("signups"), g("visitors")); return r == null ? null : Math.min(r, 1); } },
  { key: "id_verified", label: "Verified to bid", group: "Buyers", fmt: "count", good: "up", hint: "Members who finished their ID check.", calc: (g) => g("id_verified") },
  { key: "bidders", label: "Bidders", group: "Buyers", fmt: "count", good: "up", hint: "Members who bid (counted each day).", calc: (g) => g("bidders") },
  { key: "first_time_bidders", label: "First-time bidders", group: "Buyers", fmt: "count", good: "up", hint: "Members who bid for the first time.", calc: (g) => g("first_time_bidders") },
  { key: "members_total", label: "Members", group: "Buyers", fmt: "count", good: "up", hint: "All accounts.", calc: (_g, l) => l("members_total") },
  { key: "members_verified", label: "Members ready to bid", group: "Buyers", fmt: "count", good: "up", hint: "Mobile, card and ID verified.", calc: (_g, l) => l("members_verified") },
  // After the sale
  { key: "avg_pay_hours", label: "Time to pay in full", group: "After the sale", fmt: "hours", good: "down", hint: "From the sale to the money clearing.", calc: (g) => div(g("pay_hours_sum"), g("paid_in_full")) },
  { key: "default_rate", label: "Buyers who didn't pay", group: "After the sale", fmt: "pct", good: "down", hint: "Sales cancelled because the buyer didn't pay, per sale.", calc: (g) => div(g("defaults"), g("sales")) },
  { key: "card_failures", label: "Declined cards", group: "After the sale", fmt: "count", good: "down", hint: "Winning charges that failed.", calc: (g) => g("card_failures") },
  { key: "avg_transfer_days", label: "Time to transfer", group: "After the sale", fmt: "days", good: "down", hint: "From payment to the registration transfer being done.", calc: (g) => { const r = div(g("transfer_hours_sum"), g("transfers_done")); return r == null ? null : r / 24; } },
  { key: "collections", label: "Collected", group: "After the sale", fmt: "count", good: "up", hint: "Vehicles handed over.", calc: (g) => g("collections") },
  { key: "claim_rate", label: "Claims per handover", group: "After the sale", fmt: "pct", good: "down", hint: "Buyer claims as a share of handovers.", calc: (g) => div(g("claims"), g("collections")) },
  { key: "claims_upheld", label: "Claims upheld", group: "After the sale", fmt: "count", good: "down", hint: "Listings that turned out materially wrong.", calc: (g) => g("claims_upheld") },
  { key: "payouts_paid_amount", label: "Paid to sellers", group: "After the sale", fmt: "money", good: "up", hint: "Seller payouts made.", calc: (g) => g("payouts_paid_amount") },
  { key: "balances_due_amount", label: "Balances owing", group: "After the sale", fmt: "money", good: "neutral", hint: "Buyers' bank transfers still to arrive.", calc: (_g, l) => l("balances_due_amount") },
  // Sellers
  { key: "appraisals", label: "Appraisal requests", group: "Sellers", fmt: "count", good: "up", hint: "Sellers asking us to sell their vehicle.", calc: (g) => g("appraisals") },
  { key: "agreements_signed", label: "Seller agreements signed", group: "Sellers", fmt: "count", good: "up", hint: "Sellers who signed up a vehicle.", calc: (g) => g("agreements_signed") },
  { key: "appraisal_conversion", label: "Appraisals that sign", group: "Sellers", fmt: "pct", good: "up", hint: "Agreements signed per appraisal request.", calc: (g) => { const r = div(g("agreements_signed"), g("appraisals")); return r == null ? null : Math.min(r, 1); } },
  // Marketing
  { key: "searches", label: "Searches", group: "Marketing", fmt: "count", good: "up", hint: "Searches with filters.", calc: (g) => g("searches") },
  { key: "zero_result_rate", label: "Searches with no results", group: "Marketing", fmt: "pct", good: "down", hint: "Demand we have no stock for.", calc: (g) => div(g("searches_zero"), g("searches")) },
  { key: "watch_adds", label: "Vehicles watched", group: "Marketing", fmt: "count", good: "up", hint: "Hearts added.", calc: (g) => g("watch_adds") },
  { key: "partner_clicks", label: "Partner clicks", group: "Marketing", fmt: "count", good: "up", hint: "Finance, insurance, inspection, transport and warranty clicks.", calc: (g) => g("partner_clicks") },
  { key: "partner_leads", label: "Partner enquiries", group: "Marketing", fmt: "count", good: "up", hint: "Enquiries sent to partners (they may pay us a fee).", calc: (g) => g("partner_leads") },
  { key: "message_failure_rate", label: "Messages that failed", group: "Marketing", fmt: "pct", good: "down", hint: "SMS and emails that couldn't be delivered.", calc: (g) => div(g("messages_failed"), g("messages_sent") + g("messages_failed")) },
];
export const KPI = Object.fromEntries(KPIS.map((k) => [k.key, k])) as Record<string, Kpi>;

/** The funnel from a visit to a paid sale. */
export const FUNNEL: [string, string][] = [["visitors", "Visitors"], ["signups", "Joined"], ["id_verified", "Verified to bid"], ["bidders", "Bid"], ["sales", "Won"], ["paid_in_full", "Paid in full"]];

export function getter(t: Totals) {
  const g: Get = (m, d = "") => t.sum[d ? `${m}|${d}` : m] || 0;
  const l: Get = (m, d = "") => t.latest[d ? `${m}|${d}` : m] || 0;
  return { g, l };
}

export function kpiValue(key: string, t: Totals): number | null {
  const k = KPI[key];
  if (!k) return null;
  const { g, l } = getter(t);
  const v = k.calc(g, l);
  return v == null || !Number.isFinite(v) ? null : v;
}

/** Change between two values as a fraction (0.25 = up 25%), or null when there's no fair comparison. */
export function change(now: number | null, before: number | null): number | null {
  if (now == null || before == null) return null;
  if (before === 0) return now === 0 ? 0 : null;
  return (now - before) / Math.abs(before);
}

export function fmtValue(v: number | null, fmt: Fmt): string {
  if (v == null || !Number.isFinite(v)) return "–";
  switch (fmt) {
    case "money": return `$${Math.round(v).toLocaleString("en-AU")}`;
    case "pct": return `${(v * 100).toFixed(v < 0.1 && v > 0 ? 1 : 0)}%`;
    case "hours": return v < 48 ? `${v.toFixed(v < 10 ? 1 : 0)} hrs` : `${(v / 24).toFixed(1)} days`;
    case "days": return `${v.toFixed(1)} days`;
    case "ratio": return v.toFixed(1);
    default: return Math.round(v).toLocaleString("en-AU");
  }
}

/** Rows from metrics_range() into totals. */
export function toTotals(rows: { metric: string; dim: string; total: number | string; latest: number | string }[]): Totals {
  const t: Totals = { sum: {}, latest: {} };
  for (const r of rows) {
    const k = r.dim ? `${r.metric}|${r.dim}` : r.metric;
    t.sum[k] = Number(r.total) || 0;
    t.latest[k] = Number(r.latest) || 0;
  }
  return t;
}

/** One breakdown (e.g. visitors by source) as [label, value] pairs, biggest first. */
export function breakdown(t: Totals, metric: string, prefix: string, latest = false): [string, number][] {
  const src = latest ? t.latest : t.sum;
  return Object.entries(src)
    .filter(([k]) => k.startsWith(`${metric}|${prefix}:`))
    .map(([k, v]) => [k.slice(metric.length + prefix.length + 2), v] as [string, number])
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
}

/** Brisbane calendar day as YYYY-MM-DD, shifted by a number of days. */
export function brisbaneDay(offset = 0, from = new Date()): string {
  const d = new Date(from.getTime() + offset * 86400000);
  return d.toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
}

export const SOURCE_LABELS: Record<string, string> = {
  google: "Google", bing: "Bing", "other-search": "Other search engines", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok",
  youtube: "YouTube", linkedin: "LinkedIn", reddit: "Reddit", x: "X", email: "Email", sms: "SMS", newsletter: "Newsletter", app: "App",
  referral: "Other websites", direct: "Direct or typed in", unknown: "Unknown (joined before tracking)",
};
