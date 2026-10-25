// Selling a vehicle after the auction, by agreement (migration 26): the words buyers, sellers and staff see, and the
// statutory warranty check (we never give one, migration 27). Pure, shared by the website, the server and the app. The
// database decides what's allowed (after_auction_check, after_auction_rule, warranty_free_for); docs/legal-basis.md,
// section 5, has the law state by state.

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

export type WarrantyFacts = { year?: number | null; odometer?: number | null; category?: string | null; gvm?: number | null; now?: Date };
export type WarrantyFree = { free: boolean | null; why: string };

const LAW_NAMES: Record<string, string> = { NSW: "New South Wales", WA: "Western Australia", SA: "South Australia", ACT: "The ACT", TAS: "Tasmania", NT: "The Northern Territory" };

/** We never give a statutory warranty. Is this vehicle clearly outside every statutory warranty or dealer's duty to repair
 *  in its state (for a sale after the auction; in the ACT for any sale, auctions included)? Only well past the limits:
 *  two years past the age (the law counts from build, compliance or first registration, which can come after the model
 *  year), over the distance, or a kind the law doesn't cover. `free: null` means we can't tell (no year). Mirrors
 *  warranty_free_for() in migration 27, word for word. */
export function warrantyFree(state: string | null | undefined, f: WarrantyFacts): WarrantyFree {
  const st = upper(state);
  const cat = String(f.category || "");
  const bike = cat === "motorbikes";
  const towed = cat === "trailers" || cat === "caravans";
  const heavy = (Number(f.gvm) || 0) > 4500;
  const year = f.year == null ? null : Number(f.year);
  const age = year == null ? null : (f.now ?? new Date()).getFullYear() - year;
  const km = f.odometer == null ? null : Number(f.odometer);
  if (st === "QLD") return { free: true, why: "Queensland: no statutory warranty on a sale on consignment for an owner who isn't a motor dealer" };
  if (st === "VIC") return { free: false, why: "Victoria: it can't be sold after the auction" };
  const nm = LAW_NAMES[st];
  if (!nm) return { free: null, why: "Record the vehicle's state first" };
  const law = st === "NSW" ? "the dealer guarantee" : st === "TAS" || st === "NT" ? "the statutory warranty" : "the dealer's duty to repair";
  const kind = bike ? "motorcycle" : towed ? "trailer or caravan" : "vehicle";
  if (cat === "boats") return { free: true, why: `${nm}: ${law} doesn't cover boats` };
  if (heavy && ["NSW", "ACT", "TAS"].includes(st)) return { free: true, why: `${nm}: ${law} doesn't cover a vehicle over 4.5 tonnes GVM` };
  if (bike && ["SA", "ACT"].includes(st)) return { free: true, why: `${nm}: ${law} doesn't cover a second-hand motorcycle` };
  const y = ({ NSW: bike ? 5 : 10, WA: bike ? 8 : 12, SA: 15, ACT: 10, TAS: bike ? 3 : 7, NT: bike ? 5 : 10 } as Record<string, number>)[st];
  const k = towed ? null : ({ NSW: bike ? 30000 : 160000, WA: bike ? 80000 : 180000, SA: 200000, ACT: 160000, TAS: bike ? 15000 : 120000, NT: bike ? 30000 : 160000 } as Record<string, number>)[st];
  const n = (v: number) => v.toLocaleString("en-AU");
  if (k != null && km != null && km > k) return { free: true, why: `${nm}: ${law} doesn't cover a ${kind} over ${n(k)} km` };
  if (age == null) return { free: null, why: `${nm}: add its year and odometer to check that ${law} doesn't cover it` };
  if (age >= y + 2) return { free: true, why: `${nm}: ${law} doesn't cover a ${kind} more than ${y} years old (this one is from ${year})` };
  return { free: false, why: `${nm}: ${law} covers a ${kind} sold by a dealer, even for its owner, up to ${y} years old${k != null ? ` and ${n(k)} km` : ""}, and this one may be within it (${year}${km != null ? `, ${n(km)} km` : ""})` };
}
