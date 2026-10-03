// Wording shared by the website, the app and the server for partner referrals (finance, insurance,
// mobile inspections). The exact consent text is saved with each lead.
import type { Partner, PartnerKind } from "./types";

export const KIND_NOUN: Record<PartnerKind, string> = { finance: "car finance", insurance: "an insurance quote", inspection: "a mobile inspection of this vehicle" };

/** What the person agrees to before we pass their details to a partner (Privacy Act, Spam Act, NCCP referrer rules).
 *  It lists exactly what /api/leads sends to the partner for that kind of enquiry. */
export function consentText(p: Pick<Partner, "name" | "licence" | "commission_note" | "kind">, withVehicle = true) {
  const who = p.licence ? `${p.name} (${p.licence})` : p.name;
  const fee = p.commission_note ? ` ${p.commission_note.replace(/\s*$/, "").replace(/([^.])$/, "$1.")}` : "";
  const extra = p.kind === "finance" ? ", the loan amount, deposit, term and balloon I've entered"
    : p.kind === "insurance" ? ", the cover I've chosen"
    : ", any notes I add, and the vehicle's location";
  const what = `my name, mobile, email, postcode${withVehicle ? ", the vehicle I'm looking at" : ""}${extra}`;
  return `I agree that Tyrebiter can share ${what} with ${who} so they can contact me by phone, SMS and email about ${KIND_NOUN[p.kind]}.${fee} ${p.name}'s privacy policy applies to what they do with my details.`;
}

export const REFERRER_NOTE = {
  finance: "Tyrebiter isn't a lender or credit broker and doesn't hold an Australian Credit Licence. We don't recommend any loan. We can refer you to the licensed lenders and brokers shown, and may receive a fee from them, as stated.",
  insurance: "Any advice here is general and doesn't take into account your objectives, financial situation or needs, so consider whether it's right for you. Tyrebiter isn't an insurer and doesn't recommend any policy. Read the Product Disclosure Statement (PDS) and Target Market Determination (TMD) before you buy. We don't compare every insurer, and may receive a commission from those shown.",
  inspection: "Inspections are done by an independent provider, not by Tyrebiter. Their report is their opinion of the vehicle's condition on the day.",
} as const;

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
export const isPhone = (s: string) => /^(\+?61|0)[2-478](\s?\d){8}$/.test(s.replace(/[\s()-]/g, ""));
export const isPostcode = (s: string) => /^\d{4}$/.test(s);
