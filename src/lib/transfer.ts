// Transfer of ownership between payment and collection, state by state. Shared by the website and the app.
// Checked against each transport authority's website in October 2026. Rules and links change:
// [CHECK EACH STATE'S PAGE BEFORE LAUNCH, AND EVERY FEW MONTHS]
//
// Two different machines, so don't merge them. A car, ute, van, motorbike, truck, bus, trailer or caravan is a road
// vehicle: its registration belongs to the state's transport authority (TRANSFER_RULES). A boat is not: its
// registration belongs to the state's marine authority, on its own form, its own clock and its own fee
// (VESSEL_RULES). Machinery is normally neither — nothing is registered, so the certificate of sale is the whole
// record of ownership, which is the path the unregistered branch already takes.

export type StateRules = {
  authority: string;
  seller: string; sellerUrl: string;
  buyer: string; buyerUrl: string;
  cert?: string;
  permit: string; permitUrl: string;
  checkUrl: string; // the state's free rego check, for a person to use by hand (their terms forbid automated use)
};

export const TRANSFER_RULES: Record<string, StateRules> = {
  QLD: {
    authority: "Transport and Main Roads",
    seller: "Start the transfer online within 14 days of the sale (free). Your consultant gives you the buyer's details the form asks for.",
    sellerUrl: "https://www.service.transport.qld.gov.au/transferregistrationasseller/public/Welcome.xhtml",
    buyer: "Once the seller has started it, complete the transfer online within 14 days and pay the transfer fee and duty.",
    buyerUrl: "https://www.service.transport.qld.gov.au/transferregistrationasbuyer/public/Welcome.xhtml",
    cert: "Queensland needs a current safety certificate to transfer a registered light vehicle. The seller supplies it. Personalised plates, company vehicles and gas-fuelled vehicles are transferred at a customer service centre instead of online.",
    permit: "Unregistered vehicle permit", permitUrl: "https://www.qld.gov.au/transport/buying/unregistered/uvp", checkUrl: "https://www.service.transport.qld.gov.au/checkrego/public/Welcome.xhtml",
  },
  NSW: {
    authority: "Service NSW",
    seller: "Submit a notice of disposal online straight after the sale.",
    sellerUrl: "https://www.service.nsw.gov.au/transaction/submit-a-notice-of-disposal-for-a-vehicle",
    buyer: "Transfer the registration online within 14 days (late fees apply after that) and pay the stamp duty.",
    buyerUrl: "https://service.nsw.gov.au/transaction/transfer-a-vehicle-registration",
    cert: "No safety check (pink slip) is needed while the NSW registration is current.",
    permit: "Unregistered vehicle permit", permitUrl: "https://www.service.nsw.gov.au/transaction/apply-for-an-unregistered-vehicle-permit", checkUrl: "https://www.service.nsw.gov.au/transaction/check-vehicle-registration",
  },
  VIC: {
    authority: "VicRoads",
    seller: "Start the transfer in myVicRoads within 14 days of the sale. Your consultant gives you the buyer's details.",
    sellerUrl: "https://www.vicroads.vic.gov.au/buy-sell-transfer/selling-car/selling-vehicle",
    buyer: "Once it's started, finish the transfer online within 14 days and pay the motor vehicle duty.",
    buyerUrl: "https://www.vicroads.vic.gov.au/buy-sell-transfer/other-transfers/buy-from-auction",
    cert: "Victoria needs a roadworthy certificate (RWC) to transfer the registration, unless the vehicle is exempt.",
    permit: "Unregistered vehicle permit", permitUrl: "https://www.vicroads.vic.gov.au/registration/limited-use-permits/unregistered-vehicle-permits/get-an-unregistered-vehicle-permit", checkUrl: "https://service.vic.gov.au/find-services/transport-and-driving/registration/check-registration/vehicle",
  },
  WA: {
    authority: "the Department of Transport",
    seller: "Tell the Department of Transport within 7 days, online through DoTDirect.",
    sellerUrl: "https://www.transport.wa.gov.au/licensing/vehicle/buy-sell-transfer/sell",
    buyer: "Transfer the licence (registration) within 14 days on DoTDirect and pay the vehicle licence duty.",
    buyerUrl: "https://www.transport.wa.gov.au/licensing/vehicle/buy-sell-transfer/buy",
    cert: "No inspection is needed for a vehicle already licensed in WA.",
    permit: "Temporary movement permit", permitUrl: "https://www.transport.wa.gov.au/licensing/vehicle/inspected-moved/temporary-movement-permit", checkUrl: "https://online.transport.wa.gov.au/webExternal/registration/",
  },
  SA: {
    authority: "Service SA",
    seller: "Lodge a notice of disposal through mySAGOV (free).",
    sellerUrl: "https://www.sa.gov.au/topics/driving-and-transport/registration/vehicle-registration/transfers/lodge-disposal-notice",
    buyer: "Transfer the registration online within 14 days and pay the transfer fee and stamp duty (the fee goes up if you're late).",
    buyerUrl: "https://www.sa.gov.au/topics/driving-and-transport/registration/vehicle-registration/transfers/transfer-registration",
    cert: "Cars don't need an inspection to transfer. Heavy vehicles and trailers 3 years or older do.",
    permit: "Unregistered vehicle permit", permitUrl: "https://www.sa.gov.au/topics/driving-and-transport/registration/conditional-registration/unregistered-vehicle-permits", checkUrl: "https://account.ezyreg.sa.gov.au/account/check-registration.htm",
  },
  TAS: {
    authority: "Service Tasmania",
    seller: "Lodge a disposal notice online within 7 days.",
    sellerUrl: "https://www.service.tas.gov.au/services/transport/vehicle-registration/dispose-of-a-vehicle-registration/",
    buyer: "Transfer the registration online within 14 days and pay the duty.",
    buyerUrl: "https://www.service.tas.gov.au/services/transport/vehicle-registration/transfer-a-vehicle-registration/",
    permit: "Short-term unregistered vehicle permit", permitUrl: "https://www.transport.tas.gov.au/registration/vehicle_registration_and_permits/short-term-unregistered-vehicle-permit", checkUrl: "https://www.transport.tas.gov.au/rego-status/search",
  },
  ACT: {
    authority: "Access Canberra",
    seller: "Lodge a notice of disposal (online if you and the buyer both hold ACT licences).",
    sellerUrl: "https://www.accesscanberra.act.gov.au/driving-transport-and-parking/registration/selling-an-act-registered-vehicle",
    buyer: "Transfer the registration within 14 days (late fees apply) and pay the motor vehicle duty.",
    buyerUrl: "https://www.accesscanberra.act.gov.au/driving-transport-and-parking/registration/selling-an-act-registered-vehicle",
    cert: "Vehicles over 6 years old need a roadworthy inspection.",
    permit: "Unregistered vehicle permit", permitUrl: "https://www.accesscanberra.act.gov.au/driving-transport-and-parking/registration/unregistered-vehicle-permits", checkUrl: "https://rego.act.gov.au/regosoawicket/public/reg/FindRegistrationPage",
  },
  NT: {
    authority: "Motor Vehicle Registry",
    seller: "Lodge a notice of disposal within 14 days, by email, post or in person.",
    sellerUrl: "https://nt.gov.au/driving/rego/existing-nt-registration/buying-selling-a-used-vehicle-registration/former-owner-responsibilities-seller",
    buyer: "Apply to transfer it within 14 days with form R11 (email, post or in person) and pay the stamp duty.",
    buyerUrl: "https://nt.gov.au/driving/rego/existing-nt-registration/buying-selling-a-used-vehicle-registration/buyer-apply-to-transfer-vehicle-ownership",
    cert: "Light vehicles 7 years or older need a roadworthy inspection.",
    permit: "Temporary licence for an unregistered vehicle", permitUrl: "https://nt.gov.au/driving/rego/getting-an-nt-registration/temporary-licence-for-unregistered-vehicle", checkUrl: "https://nt.gov.au/driving/rego/existing-nt-registration/rego-check",
  },
};

export const rulesFor = (state?: string | null) => TRANSFER_RULES[String(state || "").toUpperCase()] || TRANSFER_RULES.QLD;

// ---------------------------------------------------------------------------
// Boats
// ---------------------------------------------------------------------------

export type VesselRules = {
  authority: string; // the marine authority, which is not always the transport authority
  seller: string;
  buyer: string; buyerUrl: string;
  sellerUrl?: string; // where the seller lodges their part, when it's a separate form from the buyer's
  sameAsVehicle?: boolean; // the state runs boats through the same transfer as vehicles
};

/** Transferring a boat into the buyer's name, by the state the boat is registered in.
 *
 *  Authority and form checked November 2026. Deliberately no day counts or fees here: a vessel's clock is its
 *  own and is not a vehicle's, and the state's page carries both, so a figure we hadn't read off the page would
 *  be the one thing on this screen that could cost a buyer a late fee.
 *  [CHECK EACH STATE'S VESSEL PAGE BEFORE LAUNCH: the deadline and fee can then be stated here]
 *
 *  null means we haven't settled that state's position, so the buyer is sent to their consultant instead of to a
 *  page we haven't read. The Australian Capital Territory and the Northern Territory are both open: the Territory
 *  may not register recreational vessels at all, and guessing either way is worse than asking us. */
export const VESSEL_RULES: Record<string, VesselRules | null> = {
  QLD: {
    authority: "Maritime Safety Queensland, through Transport and Main Roads",
    sameAsVehicle: true,
    seller: "The seller starts the transfer the same way they would for a vehicle.",
    buyer: "Queensland puts boats through the same online transfer as vehicles, trailers and caravans. Complete your part and pay the transfer fee.",
    buyerUrl: "https://www.qld.gov.au/transport/registration/transfer/online",
  },
  NSW: {
    authority: "Transport for NSW",
    seller: "The seller lodges a notice of disposal for the vessel.",
    sellerUrl: "https://www.service.nsw.gov.au/transaction/submit-notice-disposal-vessel",
    buyer: "Transfer the vessel registration with Transport for NSW. It's a different form from a vehicle's, with its own deadline and fee on the page.",
    buyerUrl: "https://www.nsw.gov.au/driving-boating-and-transport/boat-and-vessel-registration/transfer-registration",
  },
  VIC: {
    authority: "VicRoads",
    seller: "The seller lodges their part of the vessel transfer.",
    buyer: "Transfer the vessel registration with VicRoads. Boats and jet skis go through their own form, not the vehicle one.",
    buyerUrl: "https://www.vicroads.vic.gov.au/buy-sell-transfer/buy-sell-transfer-vessel",
  },
  WA: {
    authority: "the Department of Transport (marine)",
    seller: "The seller lodges their part of the vessel transfer.",
    buyer: "Transfer the vessel registration with the Department of Transport. Boat registration is handled separately from vehicle licensing, even though it's the same department.",
    buyerUrl: "https://www.transport.wa.gov.au/marine/recreational-boating/boat-registration/transfer-vessel",
  },
  SA: {
    authority: "Service SA",
    seller: "The seller lodges their part of the boat transfer.",
    buyer: "Transfer the boat registration with Service SA, which can be done online.",
    buyerUrl: "https://www.sa.gov.au/topics/boating-and-marine/boat-registration/transfer-boat-registration",
  },
  TAS: {
    authority: "Marine and Safety Tasmania, through Service Tasmania",
    seller: "The seller lodges a disposal notice for the vessel with MAST.",
    buyer: "Transfer the boat registration through Service Tasmania.",
    buyerUrl: "https://www.service.tas.gov.au/services/boats-and-fishing/boat-and-personal-water-craft-registrations/transfer-a-boat-registration/",
  },
  ACT: null,
  NT: null,
};

export const isVessel = (category?: string | null) => String(category || "") === "boats";

// ---------------------------------------------------------------------------
// Unregistered vehicle permits
// ---------------------------------------------------------------------------

/** What a buyer faces if they want to drive an unregistered vehicle off our depot. The permit's NAME is already
 *  in TRANSFER_RULES; this is the part that decides what we can truthfully promise them.
 *
 *  `online` is the one that bites: telling a New South Wales buyer they can get a permit on their phone at the
 *  gate is wrong, and they would find out standing in our yard with a paid invoice. `days` sets expectations,
 *  and `note` carries anything that would otherwise surprise them.
 *
 *  Verified November 2026 for QLD, NSW and VIC against the authorities' own pages. The rest carry null, which
 *  the copy renders as "check before collection day" rather than a guess.
 *  [CHECK WA, SA, TAS, ACT AND NT BEFORE LAUNCH] */
export type PermitFacts = { online: boolean | null; days: string | null; note: string | null };

export const PERMIT_RULES: Record<string, PermitFacts> = {
  QLD: { online: true, days: "1 to 7 days", note: "Buying online needs a Queensland customer reference number or licence; without one, we can apply for you. CTP is bought with it." },
  NSW: { online: false, days: "the trip, up to 28 days", note: "Not available online: it's over the counter at a Service NSW centre (or by post if you've held NSW registration before). The fee includes CTP, and the plates come off." },
  VIC: { online: true, days: "up to 7 days for a single trip", note: null },
  WA: { online: null, days: null, note: null },
  SA: { online: null, days: null, note: null },
  TAS: { online: null, days: null, note: null },
  ACT: { online: null, days: null, note: null },
  NT: { online: null, days: null, note: null },
};

export const permitFacts = (state?: string | null): PermitFacts =>
  PERMIT_RULES[String(state || "").toUpperCase()] || { online: null, days: null, note: null };

/** One line telling a buyer how to get the permit, true for their own state rather than for Queensland's.
 *  Written for the person who has to act on it, so where we don't know we say so instead of implying "online". */
export function permitLine(state?: string | null): string {
  const r = rulesFor(state);
  const f = permitFacts(state);
  const how = f.online === true ? `You can buy it online from ${r.authority}`
    : f.online === false ? `It isn't available online — you get it from ${r.authority} in person`
    : `Check with ${r.authority} how to get one`;
  return [`${how}${f.days ? `, and it lasts ${f.days}` : ""}.`, f.note].filter(Boolean).join(" ");
}

/** No state issues a permit for a written-off vehicle: confirmed word for word in Queensland and New South
 *  Wales, and applied everywhere because being wrong in the permissive direction is the expensive way to be
 *  wrong. Mirrors permit_possible in leaves_unregistered(). */
export const permitPossible = (writeOff?: string | null) => !["repairable", "statutory"].includes(String(writeOff || ""));

/** The vessel rules for a state, or null when we haven't settled that state (send them to their consultant). An
 *  unknown state is null too: defaulting a boat to Queensland's marine process would be a confident wrong answer,
 *  where the road rules can safely fall back because every state runs the same shape of vehicle transfer. */
export const vesselFor = (state?: string | null): VesselRules | null => VESSEL_RULES[String(state || "").toUpperCase()] ?? null;

/** A boat sold on its trailer carries two registrations, and transferring one does nothing for the other: the
 *  trailer is a road vehicle and goes through the transport authority like any other. */
export const trailerNote = (state?: string | null) =>
  `If it comes with a trailer, the trailer is registered separately as a road vehicle. Transfer it through ${rulesFor(state).authority} as well — the boat's transfer doesn't cover it.`;

export const TRANSPORT: [string, string][] = [
  ["carrier", "A car carrier or tow truck (no permit needed)"],
  ["trailer", "On a trailer"],
  ["permit", "Drive it on an unregistered vehicle permit"],
];
export const transportLabel = (t?: string | null) => (t === "drive" ? "Driven away on the transferred registration" : TRANSPORT.find(([k]) => k === t)?.[1] || "");

export const TRANSFER_STATUS: Record<string, string> = { waiting: "Waiting for you", submitted: "Being checked", complete: "Done" };

// Files people can upload as proof (photos or a PDF of the receipt or new registration certificate).
export const PROOF_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "application/pdf": "pdf" };
export const PROOF_MAX = 10 * 1024 * 1024;

/** The certificate a state needs before a registered vehicle's registration can be transferred to the buyer (null when
 *  none is needed). Mirrors roadworthy_needed() in the database (migration 20261022000022): an unknown year or weight
 *  counts as needing one. Before bidding opens, the seller's certificate date is on file (or an exemption is recorded),
 *  or the vehicle is sold unregistered. */
export function certNeeded(state: string | null | undefined, year: number | null | undefined, category: string | null | undefined, gvm?: number | null, now = new Date()): string | null {
  const st = String(state || "").toUpperCase();
  const c = String(category || "");
  const age = year ? now.getFullYear() - Number(year) : 99;
  const light = ["cars", "utes", "vans", "motorbikes"].includes(c);
  const towed = c === "caravans" || c === "trailers";
  const heavyType = c === "trucks" || c === "buses";
  // A boat has no roadworthy or safety certificate to give: it isn't a road vehicle, and its transfer runs through
  // the marine authority (VESSEL_RULES). Machinery isn't registered, so there's nothing to certify either.
  if (c === "boats" || c === "machinery") return null;
  if (st === "QLD" && (light || (towed && (gvm ?? 750) >= 750 && (gvm ?? 750) <= 4500) || (heavyType && (gvm ?? 4500) <= 4500))) return "safety certificate";
  if (st === "VIC" && (light || heavyType || (towed && (gvm ?? 0) > 4500))) return "roadworthy certificate";
  if (st === "ACT" && age >= 6 && (light || towed || (heavyType && (gvm ?? 4500) <= 4500))) return "roadworthy inspection";
  if (st === "NT" && age >= 7 && (light || (heavyType && (gvm ?? 4500) <= 4500))) return "roadworthy inspection";
  if (st === "SA" && age >= 3 && (towed || (heavyType && (gvm ?? 4501) > 4500))) return "inspection";
  return null;
}

const shortDay = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

/** The listing's line about the safety or roadworthy certificate. */
export function certLine(l: { registration?: string | null; rego_state?: string | null; state?: string | null; year?: number | null; category?: string | null; gvm_kg?: number | null; roadworthy_issued_on?: string | null; roadworthy_note?: string | null }): string {
  const st = String(l.rego_state || l.state || "").toUpperCase();
  const note = String(l.roadworthy_note || "").trim();
  if (l.registration !== "registered") return note || "Not supplied: it's sold unregistered. Registering it is up to you (your state may need an inspection first).";
  const cert = certNeeded(st, l.year, l.category, l.gvm_kg);
  if (cert && l.roadworthy_issued_on) return `${cert[0].toUpperCase()}${cert.slice(1)} supplied by the seller, issued ${shortDay(l.roadworthy_issued_on)}. ${st} needs it to transfer the registration.${note && !/^exempt/i.test(note) ? ` ${note}` : ""}`;
  if (/^exempt/i.test(note)) return note;
  if (!cert) return note || `Not needed to transfer a ${st || "registration in this state"}${st ? " registration" : ""}.`;
  return note || `${st} needs a ${cert} to transfer the registration.`;
}
