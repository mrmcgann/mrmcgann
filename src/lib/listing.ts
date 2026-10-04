// Listing accuracy and consumer-law wording, shared by the website, the app and the server.
//
// In 2024 the Federal Court ordered Grays to pay $10 million for misdescribing at least 750 cars
// it sold online: the wrong build year and transmission, features the cars didn't have, and
// damage and dashboard warning lights left out. These checks are how we make sure that doesn't
// happen here. DRAFT wording: have an Australian lawyer review it before launch.

/** What staff check against the vehicle itself before a listing can go live.
 *  Kept in step with listing_check_keys() in the database. [key, what staff do, what buyers see] */
export const LISTING_CHECKS: [string, string, string][] = [
  ["vin", "VIN on the listing matches the vehicle's VIN or compliance plate (photographed)", "VIN matches the vehicle"],
  ["year", "Build or compliance date matches the plate and the papers", "Build year checked"],
  ["odometer", "Odometer reading matches the photo of the dash, taken with the ignition on", "Odometer photographed"],
  ["transmission", "Transmission checked on the vehicle (auto, manual or other)", "Transmission checked"],
  ["fuel", "Fuel type checked on the vehicle", "Fuel type checked"],
  ["features", "Every feature in the listing is on the vehicle and works (nothing listed that isn't there)", "Listed features checked"],
  ["warning_lights", "Dash checked with the ignition on; any warning lights are listed", "Dash warning lights checked"],
  ["runs", "Started and moved under its own power, or recorded that it doesn't (or wasn't tested)", "Start and drive checked"],
  ["damage", "All visible damage photographed and listed as a flaw", "Visible damage photographed"],
  ["photos", "Photos are of this vehicle, taken for this listing (no stock or old photos)", "Photos taken for this listing"],
];
export const CHECK_KEYS = LISTING_CHECKS.map(([k]) => k);

export const RUNS: Record<string, string> = {
  drives: "Starts and drives",
  starts: "Starts, but doesn't drive",
  no_start: "Doesn't start",
  untested: "Not tested",
};
export const RUNS_HINT: Record<string, string> = {
  drives: "Started and moved under its own power when we checked it. Not a road test.",
  starts: "The engine starts, but it didn't move under its own power when we checked it.",
  no_start: "It didn't start when we checked it. Allow for a carrier or trailer.",
  untested: "We couldn't test it (for example a flat battery or no fuel). Allow for it not starting.",
};

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

/** How you're buying: at auction (a bid, including a referred bid the seller accepts) or outright (Buy Now or an accepted offer). */
export type SalePath = "auction" | "outright";

/** Plain-English consumer rights for this sale. [LAWYER TO CONFIRM for each sale path and seller type] */
export function consumerRights(path: SalePath, seller: SellerType | null | undefined): string {
  const misdescribed = "If the vehicle isn't as described you can still make a claim, and your rights under the Australian Consumer Law against misleading descriptions aren't affected.";
  if (path === "auction") {
    return "Sold by auction, with Tyrebiter acting as the seller's agent. The consumer guarantees of clear title, undisturbed possession and no undisclosed securities apply. The guarantees about acceptable quality, fitness for purpose and matching the description don't apply to auction sales. " + misdescribed;
  }
  if (seller === "business") {
    return "Bought outright (not at auction) from a business seller, so the consumer guarantees under the Australian Consumer Law, including acceptable quality, may apply as well as our claims process. " + misdescribed;
  }
  return "Bought outright (not at auction) from a private seller. The guarantees of clear title, undisturbed possession and no undisclosed securities apply; guarantees about quality generally don't apply to private sales. " + misdescribed;
}

/** One line for the confirm step. */
export function rightsLine(path: SalePath, seller: SellerType | null | undefined) {
  if (path === "auction") return "Auction sale · as is, where is · your consumer law rights aren't affected";
  return `${seller === "business" ? "Business seller" : "Private seller"} · as is, where is · your consumer law rights aren't affected`;
}

export type Correction = { field: string; label: string; before: string | null; after: string | null; created_at: string };

/** A listing is an EV or hybrid when the fuel says so: show battery health. */
export const isElectrified = (fuel?: string | null) => /electric|hybrid|ev\b|phev/i.test(fuel || "");
