// Selling a vehicle after the auction, by agreement (migration 26): the words buyers, sellers and staff see, and the
// statutory warranty guide for staff. Pure, shared by the website, the server and the app. The database decides what's
// allowed (after_auction_check, after_auction_rule); docs/legal-basis.md, section 5, has the law state by state.
import { money } from "./format.ts";

/** A state's rules for a sale after the auction, as after_auction_rule() returns them (and each offer keeps a copy). */
export type AfterRule = {
  state: string; tz: string; allowed: boolean; why?: string | null; cooling_days: number; cooling_law?: string | null;
  forms: string[]; warranty_hint?: string | null; staff_note?: string | null;
};
export type AfterDoc = { name: string; path: string };
export type AfterStatus = "pending" | "cooling_off" | "accepted" | "declined" | "expired" | "withdrawn" | "cancelled";
export type AfterOffer = {
  id: string; lot_id: number; amount: number; status: AfterStatus; expires_at: string; created_at?: string; kind?: string;
  state?: string | null; rule?: AfterRule | null; warranty?: boolean | null; warranty_text?: string | null; docs?: AfterDoc[] | null;
  consultant?: string | null; signed_name?: string | null; accepted_at?: string | null; cooling_off_until?: string | null;
  invoice_id?: string | null; cancel_reason?: string | null;
};

export const STATE_NAMES: Record<string, string> = {
  QLD: "Queensland", NSW: "New South Wales", VIC: "Victoria", WA: "Western Australia", SA: "South Australia",
  TAS: "Tasmania", ACT: "the ACT", NT: "the Northern Territory",
};
/** The states where selling after the auction can be switched on (never Victoria). */
export const AFTER_STATES = ["QLD", "NSW", "WA", "SA", "TAS", "ACT", "NT"] as const;
/** On by default: our licences already cover these (Tasmania and the NT need their own licence first). */
export const AFTER_DEFAULT = ["QLD", "NSW", "WA", "SA", "ACT"];

const upper = (s: string | null | undefined) => String(s || "").trim().toUpperCase();

/** "Wednesday 28 October, 11:59 pm (SA time)": a time in the state's own clock. */
export function stateTime(iso: string, tz: string, state?: string | null): string {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: tz || "Australia/Brisbane" });
  const time = d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: tz || "Australia/Brisbane" }).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase();
  return `${day}, ${time}${state ? ` (${upper(state)} time)` : ""}`;
}

/** The buyer's cooling-off, in words: the rule before they sign, the deadline once they have. */
export function coolingLine(rule: Pick<AfterRule, "cooling_days" | "cooling_law" | "tz" | "state"> | null | undefined, until?: string | null): string | null {
  if (!rule) return null;
  if (rule.cooling_days > 0 && until) return `You can change your mind until ${stateTime(until, rule.tz, rule.state)}: cancel on this page, free. Nothing is invoiced or taken before then.`;
  return rule.cooling_law || null;
}

/** The sign near the price on a Queensland listing: a sale on consignment has no cooling-off period, as long as it's
 *  identified as one (MDCA Act 2014 s 101; MDCA Regulation 2014 s 9(1)(b)). */
export function coolingOffSign(state: string | null | undefined): string | null {
  return upper(state) === "QLD" ? "No cooling-off period—sale on consignment." : null;
}
/** The words every Queensland advertisement carries (MDCA Regulation 2014 s 9(1)(a)): search results and cards. */
export function coolingOffAd(state: string | null | undefined): string | null {
  return upper(state) === "QLD" ? "No cooling-off period applies" : null;
}

/** The statutory warranty statement on an offer or contract. */
export function afterWarrantyLine(o: Pick<AfterOffer, "warranty" | "warranty_text">): string {
  return o.warranty ? `A statutory warranty applies to this sale: ${String(o.warranty_text || "").replace(/\.?$/, ".")} We meet it for you as the dealer.` : "No statutory warranty applies to this sale.";
}

/** What seller_lot_after() returns: the seller's side of selling it now, before the next auction (never the buyer). */
export type SellerAfterView = {
  open: boolean; why?: string | null; state?: string | null; cooling: boolean; highest: number | null; not_offered: boolean;
  defaulted?: boolean; interested?: number; price: number | null; price_at: string | null; price_via: string | null;
  offer: { status: string; amount: number; expires_at: string; cooling_off_until: string | null } | null;
};

/** The seller's dashboard, before they've agreed a price: why it didn't sell, and what they can do now. Mirrors the
 *  pass-in notice (after_seller_text). */
export function sellerAfterIntro(v: Pick<SellerAfterView, "not_offered" | "highest" | "defaulted" | "interested">): string {
  if (v.interested === 0) return "Nobody bid on it or watched it, so there's nobody to offer it to now. It goes into the next auction.";
  const end = "Nothing is sold until a buyer signs.";
  if (v.defaulted) return `The buyer didn't pay, so that sale was cancelled. You can still sell it to someone else who bid on it or watched it: tell us the lowest price you'd take, and your consultant offers it to them. ${end}`;
  const why = v.not_offered ? "The auction finished before it was offered" : v.highest != null ? "Bidding stopped below your reserve" : "Nobody bid this time";
  const how = v.highest != null
    ? `Accept the highest ${v.not_offered ? "early " : ""}bid, or tell us the lowest price you'd take, and your consultant offers it to the bidder.`
    : "Tell us the lowest price you'd take, and your consultant offers it to the people who watched it.";
  return `${why}, but you can still sell it now. ${how} ${end}`;
}

/** How an offer stands, in a few words (admin and seller views). */
export function afterStatusLabel(o: Pick<AfterOffer, "status" | "expires_at">, now = Date.now()): string {
  if (o.status === "pending") return new Date(o.expires_at).getTime() <= now ? "expired" : "waiting for the buyer";
  return ({ cooling_off: "agreed, in the cooling-off period", accepted: "sold", declined: "declined", expired: "expired", withdrawn: "withdrawn", cancelled: "cancelled" } as Record<string, string>)[o.status] || o.status;
}

export type WarrantyFacts = { year?: number | null; odometer?: number | null; category?: string | null; price?: number | null; gvm?: number | null; now?: Date };
export type WarrantyGuess = { applies: boolean | null; text: string };

/** A starting point for staff: does a statutory warranty (or a dealer's duty to repair) apply to this vehicle if we
 *  sell it after the auction, for its private owner? Age is worked out from the year, so staff check the dates the law
 *  uses (build, compliance or first registration) before they send the offer. */
export function afterWarrantyGuide(state: string | null | undefined, f: WarrantyFacts): WarrantyGuess {
  const st = upper(state);
  const year = Number(f.year) || null;
  const age = year ? (f.now ?? new Date()).getFullYear() - year : null;
  const km = f.odometer == null ? null : Number(f.odometer);
  const cat = String(f.category || "");
  const bike = cat === "motorbikes";
  const heavy = cat === "trucks" || cat === "buses" || (Number(f.gvm) || 0) > 4500;
  const towed = cat === "trailers" || cat === "caravans";
  const within = (y: number, k: number) => age != null && km != null && age <= y && km <= k;
  const none = (why: string): WarrantyGuess => ({ applies: false, text: why });
  const yes = (what: string): WarrantyGuess => ({ applies: true, text: what });
  const unknown = (what: string): WarrantyGuess => ({ applies: null, text: what });
  if (age == null || (km == null && !towed)) return unknown("Add the year and odometer to work out whether a statutory warranty applies.");
  switch (st) {
    case "QLD":
      return none("Queensland: none, because it's sold on consignment for an owner who isn't a licensee.");
    case "NSW":
      if (heavy) return none("New South Wales: the dealer guarantee doesn't cover vehicles over 4.5 tonnes GVM.");
      if (towed) return age <= 10 ? yes("Dealer guarantee: 3 months.") : none("New South Wales: a trailer or caravan over 10 years old has no dealer guarantee.");
      if (bike) return within(5, 30000) ? yes("Dealer guarantee: 3 months or 3,000 km, whichever comes first.") : none("New South Wales: no dealer guarantee for a motorcycle over 5 years old or 30,000 km.");
      return within(10, 160000) ? yes("Dealer guarantee: 3 months or 5,000 km, whichever comes first.") : none("New South Wales: no dealer guarantee for a vehicle over 10 years old or 160,000 km.");
    case "WA": {
      if (towed) return unknown("Western Australia: check whether the duty to repair covers this trailer or caravan.");
      const cash = Number(f.price) || 0;
      if (cash && cash < (bike ? 3500 : 4000)) return none(`Western Australia: no duty to repair under ${money(bike ? 3500 : 4000)}.`);
      if (bike) return within(8, 80000) ? yes("Duty to repair: 3 months or 5,000 km, whichever comes first.") : none("Western Australia: no duty to repair for a motorcycle over 8 years old or 80,000 km.");
      if (within(10, 150000)) return yes("Duty to repair: 3 months or 5,000 km, whichever comes first.");
      if (within(12, 180000)) return yes("Duty to repair: 1 month or 1,500 km, whichever comes first.");
      return none("Western Australia: no duty to repair for a vehicle over 12 years old or 180,000 km.");
    }
    case "SA": {
      if (bike || towed) return none("South Australia: the duty to repair covers cars only.");
      const cash = Number(f.price) || 0;
      if (cash && cash <= 3000) return none("South Australia: no duty to repair at $3,000 or less.");
      if (!within(15, 200000)) return none("South Australia: no duty to repair for a car first registered more than 15 years ago or driven over 200,000 km.");
      return cash > 0 && cash <= 6000 ? yes("Duty to repair: 2 months or 3,000 km, whichever comes first.") : yes("Duty to repair: 3 months or 5,000 km, whichever comes first.");
    }
    case "ACT":
      if (heavy) return none("ACT: no duty to repair for a commercial vehicle.");
      if (bike) return none("ACT: the duty to repair covers new and demonstrator motorcycles only.");
      return within(10, 160000) ? yes("Duty to repair: 3 months or 5,000 km, whichever comes first (check Schedule 1 of the Act).") : unknown("ACT: check Schedule 1 of the Act for an older or higher-kilometre vehicle.");
    case "TAS":
      if (heavy) return none("Tasmania: no statutory warranty for a commercial vehicle.");
      if (bike) return within(3, 15000) ? yes("Statutory warranty: 3 months or 3,000 km, whichever comes first.") : none("Tasmania: no statutory warranty for a motorcycle over 3 years old or 15,000 km.");
      return age < 7 && km != null && km < 120000 ? yes("Statutory warranty: 3 months or 3,000 km, whichever comes first.") : none("Tasmania: no statutory warranty from 7 years (compliance plate) or 120,000 km.");
    case "NT":
      if (bike) return within(5, 30000) ? yes("Statutory warranty: 3 months or 5,000 km, whichever comes first.") : none("Northern Territory: no statutory warranty for a motorcycle over 5 years old or 30,000 km.");
      return age < 10 && km != null && km < 160000 ? yes("Statutory warranty: 3 months or 5,000 km, whichever comes first.") : none("Northern Territory: no statutory warranty from 10 years old or 160,000 km.");
    case "VIC":
      return none("Victoria: it can't be sold after the auction.");
    default:
      return unknown("Record the vehicle's state first.");
  }
}
