// The "Sell your vehicle" form: its questions, how answers are checked and tidied, and the drawn signature.
// Shared by the website, the server and the app (no Node or Next imports). Unit-tested in tests/unit/sell.test.mjs.
import { CAT, type CategoryKey } from "./vehicles.ts";
import { MEDIA_MAX } from "./videos.ts";
import { REGO_STATES, isPlate, normalizePlate, normalizeVin, tidyFuel, tidyTransmission } from "./rego.ts";

export const PHOTO_MAX = MEDIA_MAX;
export const PHOTO_MIN = 1;

/** Overall condition, in the seller's words. */
export const CONDITIONS: [string, string, string][] = [
  ["excellent", "Excellent", "Like new. No marks you'd point out."],
  ["good", "Good", "Normal wear for its age and kilometres."],
  ["fair", "Fair", "Some dents, scratches, worn tyres or interior wear."],
  ["needs-work", "Needs work", "Damage, rust or mechanical problems."],
];

/** The yes/no questions (the same ones the Seller Agency Agreement asks; buyers see the answers). */
export const QUESTIONS: [key: string, question: string, details?: string][] = [
  ["finance", "Is there any finance owing on it?"],
  ["runs", "Does it start and drive?", "runs_details"],
  ["accident", "Has it been in an accident that needed repair?", "accident_details"],
  ["flood", "Has it ever had flood or water damage?", "flood_details"],
  ["hail", "Does it have hail damage?", "hail_details"],
  ["modifications", "Has it been modified (lift, engine, suspension, towing, etc.)?", "modifications_details"],
  ["previous_use", "Has it been used as a taxi, rideshare, hire car, driving-school or police vehicle?", "previous_use_details"],
  ["recalls", "Is there a safety recall on it that hasn't been fixed?", "recalls_details"],
  ["warning_lights", "Are any warning lights on the dash?", "warning_lights_details"],
  ["odometer_concerns", "Any reason to think the odometer isn't accurate (replaced cluster, tampering)?", "odometer_details"],
];
/** Which answer needs an explanation: "yes", except "Does it start and drive?" where it's "no". */
export const needsDetails = (key: string, answer: string) => (key === "runs" ? answer === "no" : answer === "yes");

export const WRITE_OFF: [string, string][] = [["none", "Never written off"], ["repairable", "Repairable write-off"], ["inspected", "Inspected write-off (VIC)"], ["statutory", "Statutory write-off"]];
export const SELL_WHEN: [string, string][] = [["now", "As soon as possible"], ["month", "Within a month"], ["exploring", "Just seeing what it's worth"]];
export const OWNER_TYPES: [string, string][] = [["individual", "Me"], ["joint", "Me and someone else"], ["company", "A company"], ["trust", "A trust"]];
/** Stored as the listings store them (the same words as the plate lookup); shown in plain words. */
export const TRANSMISSIONS: [string, string][] = [["Auto", "Automatic"], ["Manual", "Manual"], ["CVT", "CVT (automatic)"], ["Automated manual", "Dual-clutch or automated manual"]];
export const FUELS = ["Petrol", "Diesel", "Hybrid", "Electric", "LPG", "Other"];

/** The guided photos (the meter photo is the dash for road vehicles, the hour meter for machines and boats). */
export function photoSlots(category: string): [string, string, string][] {
  const usage = CAT[category as CategoryKey]?.usage || "km";
  return [
    ["front", "Front corner", "Stand at a front corner so we see the front and one side."],
    ["rear", "Rear corner", "The opposite corner, so we see the back and the other side."],
    ["side", "Side on", "Straight side-on, the whole vehicle in the frame."],
    ["inside", usage === "none" ? "Inside or the deck" : "Inside", usage === "none" ? "The inside, or the deck or tray." : "From the open driver's door: seats, wheel and dash."],
    ["meter", usage === "hours" ? "Hour meter" : usage === "none" ? "Plate or VIN" : "Dash with the engine on", usage === "hours" ? "So we can read the hours." : usage === "none" ? "The compliance plate or VIN." : "Shows the kilometres and any warning lights."],
  ];
}

const txt = (v: unknown, n = 500) => String(v ?? "").trim().slice(0, n);
const pick = (list: string[], v: string | null) => (v && list.includes(v) ? v : "");
const yn = (v: unknown) => (v === "yes" ? "yes" : v === "no" ? "no" : "");
export const wholeDollars = (v: unknown) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? Math.round(n) : null; };

/** The yes/no answers, tidied into what the listing and the agreement store. Returns an error message if incomplete. */
export function cleanDisclosures(d: Record<string, unknown>, extra: { business?: boolean } = {}): { value: Record<string, unknown>; error: string | null } {
  const detail = (k: string, dk: string) => (yn(d[k]) === "yes" ? `Yes: ${txt(d[dk])}` : yn(d[k]));
  const value = {
    finance: yn(d.finance), finance_amount: d.finance === "yes" ? String(wholeDollars(d.finance_amount) ?? "") : "",
    lender_name: d.finance === "yes" ? txt(d.lender_name, 120) : "", lender_ref: d.finance === "yes" ? txt(d.lender_ref, 60) : "",
    write_off: WRITE_OFF.some(([k]) => k === d.write_off) ? d.write_off : "none",
    accident: detail("accident", "accident_details"), flood: detail("flood", "flood_details"), hail: detail("hail", "hail_details"),
    modifications: detail("modifications", "modifications_details"), previous_use: detail("previous_use", "previous_use_details"),
    recalls: detail("recalls", "recalls_details"), warning_lights: detail("warning_lights", "warning_lights_details"),
    odometer_concerns: detail("odometer_concerns", "odometer_details"),
    starts_and_drives: d.runs === "no" ? `No: ${txt(d.runs_details)}` : yn(d.runs),
    business: d.business === "yes" || extra.business ? "yes" : "no",
    known_faults: txt(d.known_faults, 1000), keys: String(Math.max(0, Math.min(9, Number(d.keys) || 0))), service_books: d.service_books === "yes",
    rego_expiry: txt(d.rego_expiry, 20),
  };
  const missing = ["finance", "accident", "flood", "hail", "modifications", "previous_use", "recalls", "warning_lights", "odometer_concerns", "starts_and_drives"]
    .some((k) => !String((value as Record<string, unknown>)[k]));
  if (missing) return { value, error: "Answer every yes/no question about the vehicle." };
  if (d.finance === "yes" && !value.finance_amount) return { value, error: "Roughly how much finance is owing? We need it to pay your lender." };
  return { value, error: null };
}

// ---- The drawn signature: strokes of points in a fixed box, kept as numbers and drawn back as an SVG we write ourselves.
export type Signature = { w: number; h: number; strokes: number[][] };
export const SIG_W = 600, SIG_H = 200;

/** How much was drawn (total line length in box units). A dot or a stray tap isn't a signature. */
export function signatureInk(s: Signature | null | undefined): number {
  if (!s || !Array.isArray(s.strokes)) return 0;
  let len = 0;
  for (const st of s.strokes) for (let i = 2; i + 1 < st.length; i += 2) len += Math.hypot(st[i] - st[i - 2], st[i + 1] - st[i - 1]);
  return len;
}

/** Checks a signature from the browser or the app and tidies it (numbers only, inside the box, a sensible size). */
export function cleanSignature(raw: unknown): Signature | null {
  const s = raw as Signature;
  if (!s || typeof s !== "object" || !Array.isArray(s.strokes)) return null;
  const w = Number(s.w), h = Number(s.h);
  if (!(w > 0 && w <= 2000 && h > 0 && h <= 1000)) return null;
  if (s.strokes.length < 1 || s.strokes.length > 80) return null;
  let points = 0;
  const strokes: number[][] = [];
  for (const st of s.strokes) {
    if (!Array.isArray(st) || st.length < 2 || st.length % 2) return null;
    points += st.length / 2;
    if (points > 4000) return null;
    const clean: number[] = [];
    for (let i = 0; i < st.length; i += 2) {
      const x = Number(st[i]), y = Number(st[i + 1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      clean.push(Math.round(Math.min(w, Math.max(0, x)) * 10) / 10, Math.round(Math.min(h, Math.max(0, y)) * 10) / 10);
    }
    strokes.push(clean);
  }
  const sig = { w, h, strokes };
  return signatureInk(sig) >= Math.min(w, h) * 0.6 ? sig : null;
}

/** The signature as an SVG (paths built only from the checked numbers). */
export function signatureSvg(s: Signature, colour = "#1D1D1F"): string {
  const d = s.strokes.map((st) => st.length === 2
    ? `M${st[0]} ${st[1]}l0.1 0`
    : st.reduce((acc, v, i) => acc + (i % 2 ? ` ${v}` : `${i ? " L" : "M"}${v}`), "")).join(" ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.w} ${s.h}" width="${s.w}" height="${s.h}"><path d="${d}" fill="none" stroke="${colour}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// ---- The whole form, checked the same way in the browser and on the server.
export type SellInput = Record<string, unknown> & { disclosures?: Record<string, unknown> };
export type SellValue = {
  category: CategoryKey; registration: "registered" | "unregistered"; rego: string; state: string; vin: string;
  year: number | null; make: string; model: string; variant: string; odometer: number | null; transmission: string; fuel: string; colour: string;
  condition: string; disclosures: Record<string, unknown>;
  reserve_type: "none" | "reserve"; reserve_amount: number | null;
  suburb: string; postcode: string; name: string; mobile: string; email: string; sell_when: string; owner_type: string; business: boolean;
  signed_name: string; photos: string[];
};

export function validateSell(b: SellInput, opts: { requireSignature?: boolean; now?: Date } = {}): { errors: Record<string, string>; value: SellValue } {
  const e: Record<string, string> = {};
  const category = (CAT[b.category as CategoryKey] ? b.category : "cars") as CategoryKey;
  const usage = CAT[category].usage;
  const registration = b.registration === "unregistered" ? "unregistered" : "registered";
  const rego = normalizePlate(b.rego), vin = normalizeVin(b.vin), state = String(b.state || "").toUpperCase();
  if (registration === "registered" && !isPlate(rego)) e.rego = "Enter the number plate.";
  if (!(REGO_STATES as readonly string[]).includes(state)) e.state = "Choose the state.";
  if (vin && vin.length < 5) e.vin = "Check the VIN or chassis number.";
  const year = Number(b.year) || null;
  const thisYear = (opts.now || new Date()).getFullYear();
  if (!year || year < 1900 || year > thisYear + 1) e.year = "Enter the year it was built.";
  const make = txt(b.make, 40), model = txt(b.model, 40);
  if (!make) e.make = "Enter the make (for example Toyota).";
  if (!model) e.model = "Enter the model (for example HiLux).";
  const odometer = usage === "none" ? null : wholeDollars(b.odometer);
  if (usage !== "none" && (odometer == null || odometer < 0 || odometer > 5_000_000)) e.odometer = usage === "hours" ? "Enter the hours on the meter." : "Enter the kilometres.";
  const condition = CONDITIONS.some(([k]) => k === b.condition) ? String(b.condition) : "";
  if (!condition) e.condition = "Choose the overall condition.";
  const d = (b.disclosures || {}) as Record<string, unknown>;
  const disc = cleanDisclosures(d, { business: b.business === true || b.owner_type === "company" });
  if (disc.error) e.disclosures = disc.error;
  for (const [k, , dk] of QUESTIONS) if (dk && needsDetails(k, yn(d[k])) && !txt(d[dk])) e[`q_${k}`] = "Tell buyers a little about it.";
  const reserve_type = b.reserve_type === "none" ? "none" : b.reserve_type === "reserve" ? "reserve" : null;
  const reserve_amount = reserve_type === "reserve" ? wholeDollars(b.reserve_amount) : null;
  if (!reserve_type) e.reserve_type = "Choose no reserve, or set a reserve.";
  else if (reserve_type === "reserve" && (reserve_amount == null || reserve_amount < 100 || reserve_amount > 5_000_000)) e.reserve_amount = "Enter your reserve in whole dollars.";
  const suburb = txt(b.suburb, 60), postcode = txt(b.postcode, 4);
  if (!suburb) e.suburb = "Where is it kept? Enter the suburb or town.";
  if (!/^\d{4}$/.test(postcode)) e.postcode = "Enter a 4-digit postcode.";
  const name = txt(b.name, 120), mobile = txt(b.mobile, 20).replace(/[^\d+ ]/g, ""), email = txt(b.email, 200);
  if (name.split(/\s+/).length < 2) e.name = "Enter your first and last name.";
  if (mobile.replace(/\D/g, "").length < 8) e.mobile = "Enter a mobile number so we can call you.";
  if (!/^\S+@\S+\.\S+$/.test(email)) e.email = "Enter your email. We send you a copy of what you sign.";
  const photos = (Array.isArray(b.photos) ? b.photos : []).filter((p): p is string => typeof p === "string" && /^[\w-]+\/[\w.-]+$/.test(p)).slice(0, PHOTO_MAX);
  if (photos.length < PHOTO_MIN) e.photos = "Add at least one photo (the front corner is best).";
  const signed_name = txt(b.signed_name, 120);
  if (b.agree !== true) e.agree = "Tick to confirm you've read and agree to the agreement.";
  if (b.owner !== true) e.owner = "Tick to confirm you own it or can sell it.";
  if (!signed_name || signed_name.toLowerCase().replace(/\s+/g, " ") !== name.toLowerCase().replace(/\s+/g, " ")) e.signed_name = "Type your full name, the same as above.";
  if (opts.requireSignature !== false && !b.no_draw && !cleanSignature(b.signature)) e.signature = "Sign in the box (with your finger, a pen or the mouse).";
  return {
    errors: e,
    value: {
      category, registration, rego: registration === "registered" ? rego : "", state, vin, year, make, model, variant: txt(b.variant, 60), odometer,
      transmission: pick(TRANSMISSIONS.map(([k]) => k), tidyTransmission(txt(b.transmission, 40))), fuel: pick(FUELS, tidyFuel(txt(b.fuel, 40))), colour: txt(b.colour, 30),
      condition, disclosures: disc.value, reserve_type: reserve_type || "none", reserve_amount,
      suburb, postcode, name, mobile, email, sell_when: SELL_WHEN.some(([k]) => k === b.sell_when) ? String(b.sell_when) : "now",
      owner_type: OWNER_TYPES.some(([k]) => k === b.owner_type) ? String(b.owner_type) : "individual", business: b.business === true || b.owner_type === "company",
      signed_name, photos,
    },
  };
}

/** The form's answers back in the agreement form's shape (so a seller who used the sell form doesn't answer twice). */
export function agreementPrefill(disclosures: Record<string, unknown> | null | undefined): Record<string, string> {
  const d = disclosures || {};
  const out: Record<string, string> = {};
  const split = (v: unknown) => { const s = String(v ?? ""); const m = /^(Yes|No): ?([\s\S]*)$/.exec(s); return m ? [m[1].toLowerCase(), m[2]] : [s, ""]; };
  for (const [k, , dk] of QUESTIONS) {
    const src = k === "runs" ? d.starts_and_drives : d[k];
    const [a, det] = split(src);
    if (a === "yes" || a === "no") out[k] = a;
    if (dk && det) out[dk] = det;
  }
  for (const k of ["finance_amount", "lender_name", "lender_ref", "write_off", "known_faults", "keys", "rego_expiry"]) if (d[k] != null && d[k] !== "") out[k] = String(d[k]);
  out.service_books = d.service_books ? "yes" : "no";
  if (d.business === "yes") out.business = "yes";
  return out;
}
