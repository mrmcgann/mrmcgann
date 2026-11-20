// The seller's appointment of Super Trucker on Queensland's approved form: Form 9, "Appointment of motor dealer or
// chattel auctioneer" (Motor Dealers and Chattel Auctioneers Act 2014, ss 81-84). A consignment appointment must be in
// writing, in the approved form, with a prominent statement that the client should get independent legal advice,
// signed and dated by the client and by us, and a copy given to the client straight after; otherwise it's
// ineffective and no commission can be kept (ss 83(3), 88). It must also say either side may end it on 30 days'
// written notice (s 82(1)(i)). Substantial compliance with an approved form is enough (Acts Interpretation Act 1954
// (Qld) s 48A), so we reproduce the form's nine parts, in its order and with its headings, filled in from what the
// seller tells us, and annex the Seller Agency Agreement as the conditions (Part 5). Register section 20.
// Pure (no Next or Node imports): the agreement page previews it, the signing route stores the snapshot, the PDF
// prints it.

export const FORM9_TITLE = "Appointment of motor dealer or chattel auctioneer";
export const FORM9_ACT = "Motor Dealers and Chattel Auctioneers Act 2014 (Qld), Form 9";
export const APPOINTMENT_DAYS = 90;
export const NOTICE_DAYS = 30;
export const LEGAL_ADVICE_WARNING = "THE CLIENT IS ADVISED TO SEEK INDEPENDENT LEGAL ADVICE BEFORE SIGNING THIS FORM.";
export const TERMINATION_TEXT = "This appointment may be revoked by either party giving the other party at least 30 days written notice of the revocation, unless the parties agree in writing to an earlier day for the appointment to end.";
export const FORM9_PURPOSE = "This form enables the client to appoint a motor dealer or chattel auctioneer for the sale or auction of vehicles or goods. It must be completed, and a signed copy given to the client, before the sale. Failing to do so may result in a penalty and the loss of commission.";
export const FORM9_UNCLEAR = "If you are unclear about any part of this form or the fees, don't sign it: seek legal advice. More information: the Office of Fair Trading, www.qld.gov.au/fairtrading, 13 QGOV (13 74 68).";
export const FORM9_END = "This is the end of the approved form. Annexure A, the Super Trucker Seller Agency Agreement, forms part of this appointment.";
export const ASSIGN_CLAUSE = "The client agrees that the licensee may, at any stage, assign this appointment to another licensee without changing its terms.";
export const ASSIGN_NOTE = "If the client agrees, the licensee must give the client at least 14 days' written notice before the assignment, saying who it's assigned to, that the terms don't change, that the client may agree or disagree, and the day it takes effect.";

export type AppointmentRow = [string, string];
/** One piece of a part, in the form's order: a line of text, a section heading, label-and-answer rows, or tick boxes. */
export type AppointmentItem =
  | { t: "text"; text: string; strong?: boolean }
  | { t: "head"; text: string }
  | { t: "rows"; rows: AppointmentRow[] }
  /** tick boxes, as printed on the form, and whether each is ticked */
  | { t: "ticks"; ticks: [string, boolean][] };
export interface AppointmentPart {
  id: string;
  title: string;
  /** the form's note to the client for this part */
  note?: string;
  items: AppointmentItem[];
}
/** What's stored with the signed agreement (seller_agreements.appointment) and printed: exactly what was signed. */
export interface Appointment {
  title: string;
  act: string;
  warning: string;
  parts: AppointmentPart[];
  startOn: string;
  endOn: string;
  reserve: number | null;
  assignOk: boolean;
  agreementVersion: string;
  /** Annexure A as the client read it (the Seller Agency Agreement's sections, filled in), stored when they sign */
  annexure?: [string, string, string[]][];
  /** the client's drawn signature (numbers only, checked by cleanSignature), or null when they signed with their typed name */
  signature?: { w: number; h: number; strokes: number[][] } | null;
}
export interface AppointmentInput {
  client: { name: string; company?: string | null; abn?: string | null; address: string; phone?: string | null; email?: string | null; joint?: boolean };
  licensee: { agency: string; name: string; licenceNo: string; licenceExpiry: string; address: string; phone: string; email: string };
  vehicle: { makeModel: string; built: string | number | null; vin: string | null; engineNo?: string | null; rego?: string | null; type?: string | null; odometer: number | null; colour?: string | null };
  reserve: number | null;
  /** the day the seller signs, YYYY-MM-DD (Brisbane) */
  startOn: string;
  fees: { sellerRate: number; sellerMin: number; withdrawal: number; preInspection: number; premiumRate: number; premiumMin: number; adminFee: number; exclusivityDays: number };
  assignOk: boolean;
  agreementVersion: string;
}

const aud = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`;
const pct = (r: number) => `${Math.round(r * 10000) / 100}%`;
const or = (v: unknown, fallback = "Not supplied") => (v === null || v === undefined || String(v).trim() === "" ? fallback : String(v).trim());

/** YYYY-MM-DD plus n days (calendar days, no time zone involved). */
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
/** 20 November 2026 */
export function longDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
/** Today in Brisbane, YYYY-MM-DD. */
export function brisbaneToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The premium as the form's buyer's premium line: "6% of the price (at least $140), plus GST". */
export function premiumWords(f: AppointmentInput["fees"]): string {
  return `${pct(f.premiumRate)} of the price${f.premiumMin > 0 ? ` (at least ${aud(f.premiumMin)})` : ""}, plus GST${f.adminFee > 0 ? `, and an admin fee of ${aud(f.adminFee)} plus GST` : ""}`;
}
/** Our seller fee, or that there isn't one. */
export function sellerFeeWords(f: AppointmentInput["fees"]): string {
  return f.sellerRate > 0 ? `${pct(f.sellerRate)} of the actual sale price${f.sellerMin > 0 ? ` (at least ${aud(f.sellerMin)})` : ""}, plus GST` : "Nil: we charge you no commission on a sale through our auction";
}

export function buildAppointment(i: AppointmentInput): Appointment {
  const endOn = addDays(i.startOn, APPOINTMENT_DAYS);
  const f = i.fees;
  const clientName = i.client.company ? `${i.client.company} (signed for it by ${i.client.name})` : i.client.name;
  const text = (t: string, strong = false): AppointmentItem => (strong ? { t: "text", text: t, strong } : { t: "text", text: t });
  const head = (t: string): AppointmentItem => ({ t: "head", text: t });
  const rows = (r: AppointmentRow[]): AppointmentItem => ({ t: "rows", rows: r });
  const ticks = (k: [string, boolean][]): AppointmentItem => ({ t: "ticks", ticks: k });
  const parts: AppointmentPart[] = [
    { id: "p1", title: "Part 1—Client details", note: "The client is the registered owner of the vehicle (or is authorised by every owner to sell it), and can be a company or an individual.",
      items: [rows([["Client 1", clientName], ["ABN", or(i.client.abn, "None")], ["Address", or(i.client.address)], ["Mobile", or(i.client.phone)], ["Email address", or(i.client.email)],
        ...(i.client.joint ? [["Client 2", "Every other owner confirms this appointment with us in writing before the vehicle is listed"] as AppointmentRow] : [])])] },
    { id: "p2", title: "Part 2—Licensee details",
      items: [ticks([["Motor dealer", true], ["Chattel auctioneer", false]]),
        rows([["Agency name", i.licensee.agency], ["Licensee name", i.licensee.name], ["Licence number", or(i.licensee.licenceNo)], ["Expiry date", or(i.licensee.licenceExpiry)],
          ["Address", i.licensee.address], ["Phone", i.licensee.phone], ["Email address", i.licensee.email]]),
        text("The auction is conducted by a licensed chattel auctioneer employed by the licensee.")] },
    { id: "p3", title: "Part 3—Details of motor vehicles or chattels to be sold or auctioned",
      items: [head("Section 1—Motor vehicle"),
        rows([["Make and model", or(i.vehicle.makeModel)], ["Built date", or(i.vehicle.built)], ["VIN", or(i.vehicle.vin, "From the registration papers, checked before listing")],
          ["Engine number", or(i.vehicle.engineNo, "As on the registration papers")], ["Registration number", or(i.vehicle.rego, "Unregistered")], ["Type", or(i.vehicle.type, "Truck")],
          ["Odometer reading", i.vehicle.odometer != null ? `${i.vehicle.odometer.toLocaleString("en-AU")} km` : "Not supplied"], ["Colour", or(i.vehicle.colour)]]),
        head("Section 2—Goods"), text("Not applicable."),
        text("The client appoints the licensee to perform the service ticked below:"),
        ticks([["Sell a used motor vehicle by private treaty", false], ["Sell a used motor vehicle by auction", true], ["Other", false]])] },
    { id: "p4", title: "Part 4—Appointment of motor dealer or chattel auctioneer",
      items: [
        head("Section 1—Performance of service"), text("The client appoints the licensee to perform the service ticked:"),
        ticks([["Sale", false], ["Purchase", false], ["Auction: at our next suitable live online auction in the term; we confirm the date in writing before it's listed", true], ["Other", false]]),
        head("Section 2—Term of appointment"),
        ticks([["Single appointment", true], ["Continuing appointment", false]]),
        text(`Single appointment, for a particular service: start ${longDate(i.startOn)}, end ${longDate(endOn)}.`),
        head("Section 3—Price"),
        text(`Reserve: ${i.reserve != null && i.reserve > 0 ? `${aud(i.reserve)}. It may be lowered or removed, but not raised once bidding starts (Annexure A, section 4).` : "no reserve. The vehicle sells to the highest bid."}`),
        head("Section 4—Termination of appointment"), text(TERMINATION_TEXT, true),
      ] },
    { id: "p5", title: "Part 5—Performance of service/s", note: "Instructions, conditions or restrictions on how the service is performed.",
      items: [
        text(`Instructions/conditions: Annexure A, the Super Trucker Seller Agency Agreement (${i.agreementVersion}), which forms part of this appointment.`),
        text("In short: we sell the vehicle as the client's agent in a live online auction, under the hammer, conducted by a licensed chattel auctioneer we employ. We list it from the client's photos, video and papers (we don't visit it). Verified buyers view it at the client's address by appointment, and the buyer collects it from the client once they've paid us in full. We hold the sale money in our trust account and pay the client after the handover and the buyer's claim window."),
      ] },
    { id: "p6", title: "Part 6—Commission", note: "To the client: commission is negotiable. You pay GST on any commission charged. Know when commission is payable: it can be before a sale fully completes.",
      items: [rows([
        ["Commission on a sale through our auction", sellerFeeWords(f)],
        ["When payable", "When the vehicle is sold: taken from the sale proceeds before we pay you"],
        ["If it's sold another way during this appointment", `An amount equal to the buyer's premium we would have earned: ${pct(f.premiumRate)} of the actual sale price, plus GST${f.sellerRate > 0 ? ", and the commission above" : ""} (Annexure A, section 2)`],
        [`If it's sold in the ${f.exclusivityDays} days after this appointment ends to a buyer we introduced`, `The same amount (Annexure A, section 2)`],
        ["When those are payable", "Within 7 days of our invoice"],
      ]), text("Percentage commission is worked out only on the actual sale price.")] },
    { id: "p7", title: "Part 7—Authorisation to incur fees, charges and expenses",
      items: [text("The client authorises the licensee to incur the fees, charges and expenses below in performing the service:"), rows([
        ["Section 1—Advertising and marketing", "Authorised amount: $0. We pay for it"],
        ["Section 2—Other: withdrawal fee", f.withdrawal > 0 ? `${aud(f.withdrawal)}, payable only if, after the vehicle is listed, the client asks us to end this appointment early and we agree (Annexure A, section 8)` : "None"],
        ["Section 2—Other: inspection before listing", f.preInspection > 0 ? `${aud(f.preInspection)} including GST, which the client asked for. Taken from the sale proceeds; nothing if it doesn't sell` : "Not requested"],
        ["Section 2—Other: finance owing", "Any finance owing on the vehicle, paid to the lender from the sale proceeds"],
        ["Section 3—Licensee's rebate, discount, commission or benefit", "Referral fees from finance, insurance, warranty and transport partners if a buyer uses them. Source: those partners. Amount: varies with what the buyer takes up; paid to us, never taken from you"],
        ["Buyer's premium", `The client agrees that the auctioneer may charge the buyer a buyer's premium of ${premiumWords(f)}. The buyer pays it, and it doesn't reduce the client's proceeds`],
      ])] },
    { id: "p8", title: "Part 8—Assignment of appointment", items: [text(ASSIGN_CLAUSE), text(ASSIGN_NOTE), ticks([["I agree", i.assignOk], ["I disagree", !i.assignOk]])] },
    { id: "p9", title: "Part 9—Signatures", items: [text(LEGAL_ADVICE_WARNING, true), text(FORM9_PURPOSE), text(FORM9_UNCLEAR)] },
  ];
  return { title: FORM9_TITLE, act: FORM9_ACT, warning: LEGAL_ADVICE_WARNING, parts, startOn: i.startOn, endOn, reserve: i.reserve, assignOk: i.assignOk, agreementVersion: i.agreementVersion };
}

/** What's missing before an appointment can be signed with these details, in words (empty when it can). */
export function appointmentProblem(i: AppointmentInput): string {
  const l = i.licensee;
  if (!l.licenceNo.trim() || !l.licenceExpiry.trim() || [l.name, l.address, l.phone, l.email].some((v) => !v.trim() || v.includes("[")))
    return "Our licence details aren't set up yet, so we can't take your appointment today. Call us and we'll sort it.";
  if (i.client.name.trim().length < 3) return "Add your full name in your account.";
  if (i.client.address.trim().length < 6) return "Add your address in your account.";
  return "";
}

/** The notice period's last day: 30 days after the written notice is given (Brisbane date). */
export function noticeEnds(givenOn: string): string {
  return addDays(givenOn, NOTICE_DAYS);
}

/** The appointment in a few lines, for the agreement page and the seller's dashboard (the form itself says it in full). */
export function appointmentFacts(i: AppointmentInput): AppointmentRow[] {
  const f = i.fees;
  const endOn = addDays(i.startOn, APPOINTMENT_DAYS);
  const costs = [
    "advertising: nothing (we pay for it)",
    f.withdrawal > 0 ? `${aud(f.withdrawal)} only if, after it's listed, you ask us to end the appointment early and we agree` : "",
    f.preInspection > 0 ? `the inspection before listing you asked for, ${aud(f.preInspection)} including GST, from the sale proceeds (nothing if it doesn't sell)` : "",
  ].filter(Boolean);
  return [
    ["Term", `A single appointment to sell it by auction, from ${longDate(i.startOn)} to ${longDate(endOn)} (${APPOINTMENT_DAYS} days)`],
    ["Ending it", `Either of us can end it by giving the other at least ${NOTICE_DAYS} days' written notice (you can do it from your seller dashboard). Ending it sooner is by agreement.`],
    ["Our commission", sellerFeeWords(f)],
    ["What the buyer pays", `A buyer's premium of ${premiumWords(f)}, on top of the price, so it doesn't come out of yours`],
    ["Costs you authorise", costs.join("; ")],
    ["If it's sold another way", `During the appointment, or in the ${f.exclusivityDays} days after it to a buyer we introduced: an amount equal to the buyer's premium (Annexure A, section 2)`],
  ];
}
