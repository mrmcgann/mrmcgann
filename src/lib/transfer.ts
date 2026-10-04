// Transfer of ownership between payment and collection, state by state. Shared by the website and the app.
// Checked against each transport authority's website in October 2026. Rules and links change:
// [CHECK EACH STATE'S PAGE BEFORE LAUNCH, AND EVERY FEW MONTHS]

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
