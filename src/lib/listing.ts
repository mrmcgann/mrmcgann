// Listing accuracy and consumer-law wording, shared by the website, the app and the server.
//
// In 2024 the Federal Court ordered Grays to pay $10 million for misdescribing at least 750 cars it sold online: the
// wrong build year and transmission, features the cars didn't have, and damage and dashboard warning lights left out.
// These checks are how we make sure that doesn't happen here.
//
// We're never at the vehicle. The seller sends the photos and the walkaround video (we tell them what to film), so every
// check is a check of what they sent against the official records (registration, PPSR, VIN) and against itself. What
// comes from the seller is labelled as the seller's and passed on as they gave it; "checked" is used only for what we
// check ourselves (an agent who passes on the owner's information without adopting it, and says so, isn't making it
// their own statement: Butcher v Lachlan Elder Realty [2004] HCA 60). The legal basis for every rule here is in
// docs/legal-basis.md.

/** What staff check before a listing can go live, from the seller's photos and video and the records.
 *  Kept in step with listing_check_keys() in the database. [key, what staff do, what buyers see] */
export const LISTING_CHECKS: [string, string, string][] = [
  ["vin", "VIN on the listing matches the seller's photo of the VIN or compliance plate, the registration record and the PPSR search", "VIN matches the plate photo, rego and PPSR"],
  ["year", "Build or compliance date matches the plate photo and the papers", "Build year checked"],
  ["odometer", "Odometer reading matches the seller's photo of the dash, taken with the ignition on for this listing", "Odometer photo checked"],
  ["transmission", "Transmission matches the seller's photos and video (the gear lever or selector) and the papers", "Transmission checked"],
  ["fuel", "Fuel type matches the papers and the seller's photos", "Fuel type checked"],
  ["features", "Every feature in the listing can be seen in the seller's photos or video (nothing listed that isn't shown)", "Listed features checked"],
  ["warning_lights", "The dash photo with the ignition on shows any warning lights, and each one is listed", "Dash warning lights checked"],
  ["runs", "The seller's video shows it starting and moving under its own power, or the listing says it doesn't (or wasn't tested)", "Start and drive checked on video"],
  ["damage", "All damage visible in the seller's photos and video is listed as a flaw, with a photo", "Visible damage listed"],
  ["photos", "Photos and video are of this vehicle, taken for this listing (the plate or VIN in shot; no stock or old photos)", "Photos taken for this listing"],
  ["privacy", "Nothing in the photos, video or words shows who the seller is or where they live (their house or street, mail, people, other cars' plates)", "Photos show only the vehicle"],
];
export const CHECK_KEYS = LISTING_CHECKS.map(([k]) => k);

export const RUNS: Record<string, string> = {
  drives: "Starts and drives",
  starts: "Starts, but doesn't drive",
  no_start: "Doesn't start",
  untested: "Not tested",
};
export const RUNS_HINT: Record<string, string> = {
  drives: "The seller's video shows it starting and moving under its own power. That isn't a road test.",
  starts: "The seller's video shows the engine starting, but it didn't move under its own power.",
  no_start: "It doesn't start, the seller says. Allow for a carrier or trailer.",
  untested: "It wasn't tested (for example a flat battery or no fuel). Allow for it not starting.",
};

/** Where the condition report comes from. */
export const REMOTE_REPORT = "Prepared from the seller's photos and walkaround video, the records we check (registration, PPSR and VIN) and the seller's written declarations. We're never at the vehicle: nobody from Tyrebiter sees it in person before it's sold.";
/** What we do with the seller's photos and video. */
export const PHOTO_CHECK = "Taken by the seller for this listing. We check they show this vehicle and nothing that identifies the seller, and we remove the camera's location.";

export const WRITE_OFF: Record<string, string> = {
  none: "Not recorded as written off",
  repairable: "Repairable write-off",
  inspected: "Inspected write-off (passed its repair inspection)",
  statutory: "Statutory write-off (can never be registered: parts or recycling only)",
  unknown: "Being checked",
};

export type SellerType = "private" | "business";
export const SELLER_TYPE: Record<SellerType, string> = { private: "Private seller", business: "Business seller" };
export const SELLER_TYPE_HINT: Record<SellerType, string> = {
  private: "A person selling their own vehicle.",
  business: "A business selling a vehicle it owns (for example a fleet or company vehicle). The price includes GST if the seller is GST-registered.",
};

/** How you're buying: at auction (a bid, including a referred bid the seller accepts), after the auction (a written
 *  offer the seller agreed to, migration 26) or outright (Buy Now or an accepted offer, from before live-only). */
export type SalePath = "auction" | "after" | "outright";

/** Plain-English consumer rights for this sale (ACL ss 51-53 apply to every sale; ss 54-59 don't apply to a sale by
 *  auction by the seller's agent, ACL s 2, and apply otherwise only to a supply in trade or commerce: a private owner's
 *  sale isn't one just because an agent makes it, Williams v Pisano [2015] NSWCA 177, so for a private seller after the
 *  auction we say they may not apply, never that they're excluded). "outright" stays for sales made before live-only. */
export function consumerRights(path: SalePath, seller: SellerType | null | undefined): string {
  const misdescribed = "If the vehicle isn't as described you can still make a claim, and your rights under the Australian Consumer Law against misleading descriptions aren't affected.";
  if (path === "auction") {
    return "Sold by auction, with Tyrebiter acting as the seller's agent. The consumer guarantees of clear title, undisturbed possession and no undisclosed securities apply. The guarantees about acceptable quality, fitness for purpose and matching the description don't apply to auction sales. " + misdescribed;
  }
  if (path === "after") {
    if (seller === "business") {
      return "Bought after the auction (not at auction) from a business seller, with Tyrebiter acting as the seller's agent, so the consumer guarantees under the Australian Consumer Law, including acceptable quality, may apply as well as our claims process. " + misdescribed;
    }
    return "Bought after the auction (not at auction) from a private seller, with Tyrebiter acting as the seller's agent. The consumer guarantees of clear title, undisturbed possession and no undisclosed securities apply. The guarantees about acceptable quality, fitness for purpose and matching the description apply to sales in trade or commerce, so they may not apply to a private owner's sale; any that does apply can't be excluded. " + misdescribed;
  }
  if (seller === "business") {
    return "Bought outright (not at auction) from a business seller, so the consumer guarantees under the Australian Consumer Law, including acceptable quality, may apply as well as our claims process. " + misdescribed;
  }
  return "Bought outright (not at auction) from a private seller. The guarantees of clear title, undisturbed possession and no undisclosed securities apply; guarantees about quality generally don't apply to private sales. " + misdescribed;
}

/** One line for the confirm step. */
export function rightsLine(path: SalePath, seller: SellerType | null | undefined) {
  if (path === "auction") return "Auction sale · as is, where is · your consumer law rights aren't affected";
  if (path === "after") return `${seller === "business" ? "Business seller" : "Private seller"} · sold after the auction · your consumer law rights aren't affected`;
  return `${seller === "business" ? "Business seller" : "Private seller"} · as is, where is · your consumer law rights aren't affected`;
}

/** The statutory warranty statement, made on every listing before bidding opens. Queensland requires the auctioneer to
 *  say whether one applies, and every advertisement for a vehicle without one to say so (MDCA Regulation 2014 s 11).
 *  Staff set it on each listing (warrantyGuide() below says what usually applies). */
export function warrantyLine(v: boolean | null | undefined): string | null {
  if (v === true) return "Applies to this sale (the details are on your paperwork)";
  if (v === false) return "Doesn't apply to this sale";
  return null;
}

/** What usually applies, for staff setting the statutory warranty on a listing. A private owner's vehicle sold at
 *  auction has none in QLD (consignments for private sellers are excluded), NSW (auction with the dealer's notice), VIC,
 *  WA, SA, TAS and NT (auction sales are excluded). The ACT's obligation to repair isn't lifted for auctions (only
 *  motorcycles are), and a dealer's own vehicle can carry one (QLD Class A or B, NSW dealer guarantee). */
export function warrantyGuide(state: string | null | undefined, seller: SellerType | null | undefined, category?: string | null): string {
  const st = String(state || "").toUpperCase();
  if (st === "ACT" && category !== "motorbikes") return "ACT: the dealer's obligation to repair can apply to a vehicle sold at auction (not motorbikes or commercial vehicles). Check its age and odometer against the ACT rules before choosing.";
  if (seller === "business") return "A dealer's or business's vehicle can carry one (Queensland Class A or B, the NSW dealer guarantee). Check with the seller.";
  return `${st || "This state"}: none applies to a private owner's vehicle sold at auction.`;
}

/** The sign beside the price (QLD MDCA Regulation s 11: "no statutory warranty"). */
export function warrantySign(v: boolean | null | undefined): string | null {
  if (v === false) return "No statutory warranty.";
  if (v === true) return "A statutory warranty applies to this sale.";
  return null;
}

export type Correction = { field: string; label: string; before: string | null; after: string | null; created_at: string };

/** A listing is an EV or hybrid when the fuel says so: show battery health. */
export const isElectrified = (fuel?: string | null) => /electric|hybrid|ev\b|phev/i.test(fuel || "");
