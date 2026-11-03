// The buyer's sale contract: what a winning bidder is given, state by state.
//
// The contract itself is made at the fall of the hammer (Sale of Goods Act 1923 (NSW) s 60(1)(a)-(b), Sale of Goods
// Act 1896 (Qld) s 59 and the other states' equivalents), on the Terms the bidder accepted before bidding and the
// auction conditions they ticked before entering the room. This document RECORDS that contract. It never makes it,
// and nothing here is a condition of the sale: a buyer who never opens it still bought the vehicle.
//
// Two states want the buyer's signature on the auction notice, so the acknowledgement is how we discharge that
// (`needsSignature`). Queensland wants the owner named, which is the one place a seller's name reaches a buyer.
// docs/legal-basis.md section 12 holds the sources.
//
// Pure TypeScript, relative imports only, so the tests and the app can both run it.

export type StateCode = "QLD" | "NSW" | "VIC" | "WA" | "SA" | "TAS" | "ACT" | "NT";

export interface StateRule {
  state: StateCode;
  /** The form or statement this state's law makes us give a buyer on an auction sale, in its own words. */
  document: string | null;
  /** Does the buyer sign it, with a copy back to them? */
  signed: boolean;
  /** Must the statement name the person who owned the vehicle immediately before the sale? */
  namesOwner: boolean;
  /** The notice this state requires on the document, or that we give anyway. */
  notice: string | null;
  /** What the register says we still have to confirm for this state. Empty once it's settled. */
  toConfirm: string | null;
  source: string;
}

/** Every state's position on what a buyer gets when a vehicle is knocked down to them at auction.
 *  Where a state isn't settled from a primary source yet, `toConfirm` says so and we still give the full
 *  statement: the Queensland form is the strictest, so giving it everywhere can only ever be more than the
 *  minimum, never less. */
export const STATE_RULES: Record<StateCode, StateRule> = {
  QLD: {
    state: "QLD",
    document: "Statement to the buyer (Motor Dealers and Chattel Auctioneers Act 2014 s 74)",
    signed: false, // the Act requires OUR signature, not the buyer's
    namesOwner: true,
    notice: "This statement is given under section 74 of the Motor Dealers and Chattel Auctioneers Act 2014 (Qld). It names the person who owned the vehicle immediately before the sale because section 8 of the Regulation requires it. No statutory warranty applies to a vehicle sold at auction on consignment for an owner who is not a motor dealer, and no cooling-off period applies to a sale by auction.",
    toConfirm: null,
    source: "MDCA Act 2014 (Qld) s 74(1)-(3) (licensee: s 14 covers motor dealers and chattel auctioneers; no auction or consignment exemption, cf. ss 6, 100(2)); MDCA Regulation 2014 (Qld) s 8 (particulars, including s 8(a) the owner's name, and the odometer in words and figures); Reg s 11 (the 'no statutory warranty' sign)",
  },
  NSW: {
    state: "NSW",
    document: "Form 11 auction notice",
    signed: true,
    namesOwner: false,
    notice: "Form 11 auction notice: this vehicle was sold at auction. The dealer guarantee under the Motor Dealers and Repairers Act 2013 (NSW) does not apply to a vehicle sold at auction. No cooling-off period applies to a sale by auction.",
    toConfirm: null,
    source: "Motor Dealers and Repairers Act 2013 (NSW) and Regulation; NSW Fair Trading 'Required forms for motor dealers' (Form 11 is the auction notice; the dealer and the buyer sign the form at the time of sale and the buyer is given a copy)",
  },
  SA: {
    state: "SA",
    document: "Form 11 auction notice and Form 13 notice to the purchaser",
    signed: true,
    namesOwner: false,
    notice: "Form 11 auction notice and Form 13 notice to the purchaser: this vehicle was sold at auction. The dealer's duty to repair under the Second-hand Vehicle Dealers Act 1995 (SA) does not apply to a vehicle sold at auction for an owner who is not a dealer. No cooling-off period applies to a sale by auction.",
    toConfirm: null,
    source: "Second-hand Vehicle Dealers Act 1995 (SA) ss 7, 20, 23(3); Consumer and Business Services forms 11 and 13",
  },
  VIC: {
    state: "VIC",
    document: null,
    signed: false,
    namesOwner: false,
    notice: "This vehicle was sold at public auction by the owner's agent. A consigned vehicle in Victoria can only be sold under the hammer. No cooling-off period applies to a sale by auction.",
    toConfirm: "Whether the Motor Car Traders Act 1986 (Vic) or its regulations require a trader to give an auction buyer a prescribed notice, and what the dealings book must record about the buyer.",
    source: "Motor Car Traders Act 1986 (Vic); Consumer Affairs Victoria 'Motor car auction house guidelines' (dealings book records owner and buyer)",
  },
  WA: {
    state: "WA",
    document: null,
    signed: false,
    namesOwner: false,
    notice: "This vehicle was sold at auction by the owner's agent. The dealer's duty to repair under the Motor Vehicle Dealers Act 1973 (WA) does not apply to a vehicle sold at auction. No cooling-off period applies to a sale by auction.",
    toConfirm: "Whether the Motor Vehicle Dealers (Sales) Regulations 1974 (WA) prescribe a notice for an auction buyer, as distinct from the Schedule 5 contract used for a sale by private treaty.",
    source: "Motor Vehicle Dealers Act 1973 (WA) ss 5, 21, 32A-32D; Motor Vehicle Dealers (Sales) Regulations 1974 (WA)",
  },
  ACT: {
    state: "ACT",
    document: null,
    signed: false,
    namesOwner: false,
    notice: "This vehicle was sold at auction by the owner's agent. No cooling-off period applies to a sale by auction. The dealer's duty to repair under the Sale of Motor Vehicles Act 1977 (ACT) can apply even to a vehicle sold at auction, so we do not list a vehicle in the ACT that the duty would cover.",
    toConfirm: "Whether the section 20 notice and the section 21 endorsement are required on an auction sale as well as a sale by private treaty.",
    source: "Sale of Motor Vehicles Act 1977 (ACT) ss 20, 21, 23-25B, 31, 33",
  },
  TAS: {
    state: "TAS",
    document: null,
    signed: false,
    namesOwner: false,
    notice: "This vehicle was sold at auction by the owner's agent. Auctioning a vehicle for its owner is not 'dealing' under the Motor Vehicle Traders Act 2011 (Tas). No cooling-off period applies to a sale by auction.",
    toConfirm: null,
    source: "Motor Vehicle Traders Act 2011 (Tas) ss 4(1), 4(3)(d), 4(4)(e), 6",
  },
  NT: {
    state: "NT",
    document: null,
    signed: false,
    namesOwner: false,
    notice: "This vehicle was sold at auction by a licensed auctioneer for the owner. No cooling-off period applies to a sale by auction.",
    toConfirm: "Whether an auctioneer in the Northern Territory must give a buyer a prescribed notice.",
    source: "Consumer Affairs NT; nt.gov.au 'Buying a used vehicle'",
  },
};

const code = (s: string | null | undefined): StateCode | null => {
  const k = String(s || "").trim().toUpperCase();
  return (k in STATE_RULES ? k : null) as StateCode | null;
};

/** The rule for a vehicle's state. An unknown state gets Queensland's, the strictest, so a buyer is never
 *  given less than some state requires because we couldn't read the state off the lot. */
export const ruleFor = (state: string | null | undefined): StateRule => STATE_RULES[code(state) ?? "QLD"];

/** Does this state's law want the buyer's signature on the auction notice (and a copy back to them)? */
export const needsSignature = (state: string | null | undefined): boolean => ruleFor(state).signed;

/** Does the buyer's statement have to name the person who owned the vehicle immediately before the sale?
 *  Queensland only: MDCA Act s 74(1)(b) with Regulation s 8(a). Never the address, never before the hammer. */
export const namesOwner = (state: string | null | undefined): boolean => ruleFor(state).namesOwner;

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
  "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function under1000(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
  const rest = n % 100;
  return ONES[Math.floor(n / 100)] + " hundred" + (rest ? " and " + under1000(rest) : "");
}

/** An odometer reading in words. Queensland's Regulation s 8 wants the reading "in words and figures", so the
 *  statement carries both and they have to agree. */
export function odometerWords(km: number | null | undefined): string | null {
  // Number(null) is 0, so a missing reading would print "zero kilometres" on a statutory statement. Guard first.
  if (km == null || (typeof km === "string" && !String(km).trim())) return null;
  const n = Number(km);
  if (!Number.isFinite(n) || n < 0 || n > 9_999_999 || Math.floor(n) !== n) return null;
  if (n === 0) return "zero";
  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (millions) parts.push(under1000(millions) + " million");
  if (thousands) parts.push(under1000(thousands) + " thousand");
  if (rest) parts.push(under1000(rest));
  return parts.join(", ");
}

export interface SaleFacts {
  state?: string | null;
  odometer?: number | null;
  /** What the seller told us, from the sell form's own questions. */
  odometerConcerns?: boolean | null;
  odometerDetails?: string | null;
  engineReplaced?: boolean | null;
  engineReplacedWhen?: string | null;
}

/** The odometer line, with the seller's own disclosure. "if known to the licensee" is the test, so when the
 *  seller didn't say, we say that rather than implying we checked. */
export function odometerLine(f: SaleFacts): string {
  const words = odometerWords(f.odometer);
  const reading = words ? `${Number(f.odometer).toLocaleString("en-AU")} km (${words} kilometres)` : "Not recorded";
  if (f.odometerConcerns === true) {
    return `${reading}. The owner told us there is reason to doubt the reading${f.odometerDetails ? `: ${f.odometerDetails}` : ""}.`;
  }
  if (f.odometerConcerns === false) return `${reading}. The owner told us the odometer has not been replaced or altered.`;
  return `${reading}. We are not told whether the odometer has been replaced or altered, and we cannot verify the true distance travelled.`;
}

/** The engine line: Queensland asks whether the engine was replaced and when, so far as we know. */
export function engineLine(f: SaleFacts): string {
  if (f.engineReplaced === true) return `The owner told us the engine has been replaced${f.engineReplacedWhen ? ` (${f.engineReplacedWhen})` : ""}.`;
  if (f.engineReplaced === false) return "The owner told us the engine has not been replaced.";
  return "We are not told whether the engine has been replaced.";
}

/** How the sale was made, for the top of the document. Always the hammer: there is one bidding engine. */
export const soldLine = (auctioneer: string | null | undefined, when: string) =>
  `Sold by auction at the fall of the hammer on ${when}, in a live online auction conducted by ${auctioneer || "our licensed auctioneer"}.`;

/** What the buyer is asked to tick. Receipt and acknowledgement, never a condition of the sale. */
export const ACK_TEXT =
  "I acknowledge I bought this vehicle at auction at the fall of the hammer, that I have been given this statement, " +
  "and that I accepted the Terms of Sale and the auction conditions before I bid. I understand the sale was already " +
  "binding when the hammer fell, and that signing here records it rather than making it.";

/** The line under the signature, which differs where the state's own form is what the buyer is signing. */
export function ackNote(state: string | null | undefined): string {
  const r = ruleFor(state);
  return r.signed && r.document
    ? `Your ${r.document} is signed by us and by you, and your copy is attached to this statement.`
    : "Signing is a receipt. The sale was complete at the fall of the hammer whether or not you sign.";
}
