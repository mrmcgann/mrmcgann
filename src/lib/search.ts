// Search for the whole site: filter names, the plain-English query parser
// ("hilux under 30k in qld diesel"), typeahead suggestions and labels.
// Used in the browser (search bar, filters) and on the server (search API),
// and mirrored by public.lots_matching() in the database.
import { CATEGORIES, CAT, MAKES, MAKE_ALIASES, STATE_WORDS, STATE_NAMES, FUELS, TRANS, LICENCES, kindLabel, categoryOf, type CategoryKey } from "./vehicles.ts";

export const FILTER_KEYS = ["q", "cat", "type", "make", "model", "ymin", "ymax", "min", "max", "km", "hrs", "ccmin", "ccmax", "lams", "lic", "berths", "lenmin", "lenmax",
  "fuel", "trans", "drive", "state", "seller", "nores", "buynow", "ending", "grade", "sort", "view"] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type SearchFilters = Partial<Record<FilterKey, string>>;

export const SORTS: [string, string][] = [["ending", "Closing soonest"], ["newest", "Latest listings"], ["price", "Lowest price"], ["price_desc", "Highest price"],
  ["km", "Lowest kilometres"], ["year", "Newest vehicle"], ["bids", "Most bids"]];
export const ENDINGS: [string, string][] = [["1h", "Within the hour"], ["today", "Within 24 hours"], ["3d", "Within 3 days"]];

const DIGITS = /^\d{1,9}$/;
const VALID: Partial<Record<FilterKey, (v: string) => string | null>> = {
  cat: (v) => (v === "cheap" || CAT[v] ? v : null),
  type: (v) => (/^[a-z0-9-]{1,30}$/.test(v) ? v : null),
  state: (v) => (STATE_NAMES[v.toUpperCase()] ? v.toUpperCase() : null),
  fuel: (v) => (FUELS.some((f) => f[0] === v.toLowerCase()) ? v.toLowerCase() : null),
  trans: (v) => (/^auto/i.test(v) ? "auto" : /^manual/i.test(v) ? "manual" : null),
  drive: (v) => (/^(2WD|4WD|AWD)$/i.test(v) ? v.toUpperCase() : null),
  lic: (v) => (LICENCES.some((l) => l[0] === v.toUpperCase()) ? v.toUpperCase() : null),
  seller: (v) => (v === "private" || v === "business" ? v : null),
  ending: (v) => (["1h", "today", "3d"].includes(v) ? v : null),
  grade: (v) => (/^[A-E]$/i.test(v) ? v.toUpperCase() : null),
  sort: (v) => (SORTS.some((s) => s[0] === v) ? v : null),
  view: (v) => (v === "offers" || v === "closed" ? v : null),
  lams: (v) => (v === "1" ? v : null), nores: (v) => (v === "1" ? v : null), buynow: (v) => (v === "1" ? v : null),
  make: (v) => v.trim().slice(0, 40) || null, model: (v) => v.trim().slice(0, 40) || null, q: (v) => v.replace(/\s+/g, " ").trim().slice(0, 80) || null,
};
for (const k of ["ymin", "ymax", "min", "max", "km", "hrs", "ccmin", "ccmax", "berths"] as const) VALID[k] = (v) => (DIGITS.test(v) ? v : null);
for (const k of ["lenmin", "lenmax"] as const) VALID[k] = (v) => (/^\d{1,2}(\.\d)?$/.test(v) ? v : null);

/** Keep only known filters with sane values (from a URL, a form or a saved search). */
export function cleanFilters(input: Record<string, unknown>): SearchFilters {
  const out: SearchFilters = {};
  for (const k of FILTER_KEYS) {
    const raw = input[k];
    if (raw == null || raw === "") continue;
    const v = VALID[k]!(String(raw));
    if (v != null) out[k] = v;
  }
  // older links: ?body=Tipper and ?trans=Auto still work
  if (!out.q && typeof input.body === "string" && input.body) out.q = String(input.body).slice(0, 40);
  if (out.sort === "ending") delete out.sort;
  return out;
}
/** Filters from a URL. Plain-English keywords ("hilux under 30k qld") are understood; filters set explicitly win. */
export function filtersFromParams(sp: URLSearchParams): SearchFilters {
  const raw = cleanFilters(Object.fromEntries(sp.entries()));
  if (!raw.q) return raw;
  const parsed = parseQuery(raw.q).f;
  const { q: _q, ...explicit } = raw;
  return cleanFilters({ ...parsed, ...explicit, q: parsed.q });
}
export function toQueryString(f: SearchFilters, extra: Record<string, string> = {}) {
  const p = new URLSearchParams();
  for (const k of FILTER_KEYS) if (f[k]) p.set(k, f[k]!);
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return p.toString();
}
export const searchHref = (f: SearchFilters) => { const s = toQueryString(f); return `/auctions${s ? `?${s}` : ""}`; };

// ---------------------------------------------------------------------------
// Plain-English parser
// ---------------------------------------------------------------------------
type Action = Partial<SearchFilters> & { _make?: string; _model?: string; _rank?: number; _keep?: boolean };
interface Phrase { words: string[]; act: Action }

const money = (n: number) => "$" + Math.round(n).toLocaleString("en-AU");
const norm = (s: string) => s.toLowerCase()
  .replace(/[’']/g, "")
  .replace(/(\d),(?=\d)/g, "$1")
  .replace(/(\d?)([a-z])[-.](?=[a-z0-9])/g, (m, d, c) => (d ? m : `${c} `))
  .replace(/(\d)-(?=[a-z])/g, "$1 ")
  .replace(/\b4\s*x\s*4\b/g, "4x4")
  .replace(/[^a-z0-9$.+<>#\s-]/g, " ")
  .replace(/\s+/g, " ").trim();
const compress = (s: string) => s.toLowerCase().replace(/[\s\-.]/g, "");
const spaced = (s: string) => norm(s.replace(/([a-z])([A-Z])/g, "$1 $2"));

const KIND_WORDS: [string, CategoryKey, string?][] = [
  ["car", "cars"], ["cars", "cars"], ["sedan", "cars", "sedan"], ["hatch", "cars", "hatch"], ["hatchback", "cars", "hatch"], ["wagon", "cars", "wagon"], ["station wagon", "cars", "wagon"],
  ["suv", "cars", "suv"], ["coupe", "cars", "coupe"], ["convertible", "cars", "convertible"], ["cabriolet", "cars", "convertible"], ["people mover", "cars", "people-mover"],
  ["7 seater", "cars", "people-mover"], ["seven seater", "cars", "people-mover"], ["classic", "cars", "classic"], ["classic car", "cars", "classic"], ["vintage", "cars", "classic"], ["collectable", "cars", "classic"],
  ["ute", "utes"], ["utes", "utes"], ["pickup", "utes"], ["pick up", "utes"], ["dual cab", "utes", "dual-cab"], ["double cab", "utes", "dual-cab"], ["crew cab", "utes", "dual-cab"],
  ["single cab", "utes", "single-cab"], ["extra cab", "utes", "extra-cab"], ["space cab", "utes", "extra-cab"], ["king cab", "utes", "extra-cab"], ["super cab", "utes", "extra-cab"],
  ["cab chassis", "utes", "cab-chassis"], ["tray back", "utes", "cab-chassis"], ["trayback", "utes", "cab-chassis"], ["4wd wagon", "utes", "4wd-wagon"], ["4x4 wagon", "utes", "4wd-wagon"],
  ["van", "vans"], ["vans", "vans"], ["panel van", "vans", "van"], ["crew van", "vans", "crew-van"], ["refrigerated van", "vans", "refrigerated-van"], ["fridge van", "vans", "refrigerated-van"], ["reefer van", "vans", "refrigerated-van"], ["high roof", "vans", "high-roof"],
  ["truck", "trucks"], ["trucks", "trucks"], ["lorry", "trucks"], ["light truck", "trucks", "light"], ["tipper", "trucks", "tipper"], ["tip truck", "trucks", "tipper"], ["tray truck", "trucks", "tray"],
  ["tabletop", "trucks", "tray"], ["table top", "trucks", "tray"], ["flatbed", "trucks", "tray"], ["flat deck", "trucks", "tray"], ["pantech", "trucks", "pantech"], ["refrigerated truck", "trucks", "refrigerated"],
  ["fridge truck", "trucks", "refrigerated"], ["reefer truck", "trucks", "refrigerated"], ["tilt tray", "trucks", "tilt-tray"], ["tilt slide", "trucks", "tilt-tray"], ["tow truck", "trucks", "tilt-tray"],
  ["crane truck", "trucks", "crane"], ["hiab", "trucks", "crane"], ["tanker", "trucks", "tanker"], ["water truck", "trucks", "tanker"], ["fuel truck", "trucks", "tanker"], ["rigid", "trucks", "rigid"],
  ["prime mover", "trucks", "prime-mover"], ["primemover", "trucks", "prime-mover"], ["semi truck", "trucks", "prime-mover"], ["tractor unit", "trucks", "prime-mover"],
  ["trailer", "trailers"], ["trailers", "trailers"], ["box trailer", "trailers", "box"], ["car trailer", "trailers", "car"], ["car carrier", "trailers", "car"], ["car transporter", "trailers", "car"],
  ["plant trailer", "trailers", "plant"], ["machinery trailer", "trailers", "plant"], ["tag trailer", "trailers", "plant"], ["tipping trailer", "trailers", "tipping"], ["tipper trailer", "trailers", "tipping"],
  ["flat top", "trailers", "flat-top"], ["flat top trailer", "trailers", "flat-top"], ["semi trailer", "trailers", "semi"], ["semi", "trailers", "semi"], ["b double", "trailers", "semi"],
  ["horse float", "trailers", "horse"], ["float", "trailers", "horse"], ["horse trailer", "trailers", "horse"], ["boat trailer", "trailers", "boat"],
  ["bus", "buses"], ["buses", "buses"], ["minibus", "buses", "minibus"], ["mini bus", "buses", "minibus"], ["coach", "buses", "coach"], ["coaches", "buses", "coach"], ["school bus", "buses", "bus"],
  ["motorbike", "motorbikes"], ["motorbikes", "motorbikes"], ["motorcycle", "motorbikes"], ["motorcycles", "motorbikes"], ["motor bike", "motorbikes"], ["bike", "motorbikes"], ["bikes", "motorbikes"],
  ["road bike", "motorbikes", "road"], ["sports bike", "motorbikes", "sport"], ["sport bike", "motorbikes", "sport"], ["sportsbike", "motorbikes", "sport"], ["cruiser", "motorbikes", "cruiser"],
  ["adventure bike", "motorbikes", "adventure"], ["adv", "motorbikes", "adventure"], ["dirt bike", "motorbikes", "dirt"], ["dirtbike", "motorbikes", "dirt"], ["trail bike", "motorbikes", "dirt"], ["enduro", "motorbikes", "dirt"],
  ["motocross", "motorbikes", "dirt"], ["scooter", "motorbikes", "scooter"], ["moped", "motorbikes", "scooter"], ["quad", "motorbikes", "atv"], ["quad bike", "motorbikes", "atv"], ["atv", "motorbikes", "atv"],
  ["side by side", "motorbikes", "utv"], ["utv", "motorbikes", "utv"], ["buggy", "motorbikes", "utv"],
  ["caravan", "caravans"], ["caravans", "caravans"], ["rv", "caravans"], ["pop top", "caravans", "pop-top"], ["poptop", "caravans", "pop-top"], ["camper", "caravans", "camper"], ["campers", "caravans", "camper"],
  ["camper trailer", "caravans", "camper"], ["motorhome", "caravans", "motorhome"], ["motorhomes", "caravans", "motorhome"], ["motor home", "caravans", "motorhome"], ["campervan", "caravans", "campervan"],
  ["camper van", "caravans", "campervan"], ["fifth wheeler", "caravans", "fifth-wheeler"], ["5th wheeler", "caravans", "fifth-wheeler"], ["fifth wheel", "caravans", "fifth-wheeler"],
  ["boat", "boats"], ["boats", "boats"], ["marine", "boats"], ["runabout", "boats", "runabout"], ["tinny", "boats", "tinny"], ["tinnie", "boats", "tinny"], ["tin boat", "boats", "tinny"], ["aluminium boat", "boats", "tinny"],
  ["fishing boat", "boats", "fishing"], ["centre console", "boats", "fishing"], ["center console", "boats", "fishing"], ["cabin cruiser", "boats", "cabin"], ["half cabin", "boats", "cabin"],
  ["jet ski", "boats", "jet-ski"], ["jetski", "boats", "jet-ski"], ["jet skis", "boats", "jet-ski"], ["pwc", "boats", "jet-ski"], ["waverunner", "boats", "jet-ski"], ["yacht", "boats", "yacht"], ["sailboat", "boats", "yacht"], ["pontoon", "boats", "pontoon"],
  ["machinery", "machinery"], ["machine", "machinery"], ["plant", "machinery"], ["earthmoving", "machinery"], ["earth moving", "machinery"], ["farm", "machinery"], ["farm machinery", "machinery"],
  ["tractor", "machinery", "tractor"], ["tractors", "machinery", "tractor"], ["excavator", "machinery", "excavator"], ["excavators", "machinery", "excavator"], ["digger", "machinery", "excavator"],
  ["mini excavator", "machinery", "excavator"], ["mini digger", "machinery", "excavator"], ["skid steer", "machinery", "skid-steer"], ["skidsteer", "machinery", "skid-steer"], ["posi track", "machinery", "skid-steer"],
  ["track loader", "machinery", "skid-steer"], ["loader", "machinery", "loader"], ["wheel loader", "machinery", "loader"], ["front end loader", "machinery", "loader"], ["backhoe", "machinery", "backhoe"],
  ["forklift", "machinery", "forklift"], ["forklifts", "machinery", "forklift"], ["fork lift", "machinery", "forklift"], ["telehandler", "machinery", "telehandler"],
  ["ride on mower", "machinery", "mower"], ["ride on", "machinery", "mower"], ["zero turn", "machinery", "mower"], ["mower", "machinery", "mower"],
];
const FLAG_WORDS: [string, Action][] = [
  ["diesel", { fuel: "diesel" }], ["petrol", { fuel: "petrol" }], ["unleaded", { fuel: "petrol" }], ["ulp", { fuel: "petrol" }], ["hybrid", { fuel: "hybrid" }], ["plug in hybrid", { fuel: "hybrid" }], ["phev", { fuel: "hybrid" }],
  ["electric", { fuel: "electric" }], ["ev", { fuel: "electric" }], ["lpg", { fuel: "lpg" }], ["gas", { fuel: "lpg" }],
  ["auto", { trans: "auto" }], ["automatic", { trans: "auto" }], ["cvt", { trans: "auto" }], ["dsg", { trans: "auto" }], ["manual", { trans: "manual" }], ["stick shift", { trans: "manual" }],
  ["4x4", { drive: "4WD" }], ["4wd", { drive: "4WD" }], ["four wheel drive", { drive: "4WD" }], ["4 wheel drive", { drive: "4WD" }], ["awd", { drive: "AWD" }], ["all wheel drive", { drive: "AWD" }],
  ["2wd", { drive: "2WD" }], ["two wheel drive", { drive: "2WD" }], ["rwd", { drive: "2WD" }], ["fwd", { drive: "2WD" }],
  ["lams", { lams: "1", cat: "motorbikes" }], ["lams approved", { lams: "1", cat: "motorbikes" }], ["learner", { lams: "1", cat: "motorbikes" }], ["learner approved", { lams: "1", cat: "motorbikes" }],
  ["car licence", { lic: "C" }], ["car license", { lic: "C" }], ["lr licence", { lic: "LR" }], ["light rigid", { lic: "LR" }], ["mr licence", { lic: "MR" }], ["medium rigid", { lic: "MR" }],
  ["hr licence", { lic: "HR" }], ["heavy rigid", { lic: "HR" }], ["hc licence", { lic: "HC" }], ["heavy combination", { lic: "HC" }], ["mc licence", { lic: "MC" }], ["multi combination", { lic: "MC" }],
  ["no reserve", { nores: "1" }], ["without reserve", { nores: "1" }], ["buy now", { buynow: "1" }], ["buy it now", { buynow: "1" }],
  ["ending today", { ending: "today" }], ["closing today", { ending: "today" }], ["ends today", { ending: "today" }], ["ending soon", { ending: "1h" }], ["closing soon", { ending: "1h" }], ["ending this week", { ending: "3d" }],
  ["newest", { sort: "newest" }], ["latest", { sort: "newest" }], ["just listed", { sort: "newest" }], ["new listings", { sort: "newest" }], ["cheapest", { sort: "price" }], ["cheap", { sort: "price" }],
  ["bargain", { sort: "price" }], ["most bids", { sort: "bids" }], ["popular", { sort: "bids" }],
  ["excellent condition", { grade: "A" }], ["grade a", { grade: "A" }], ["a grade", { grade: "A" }], ["immaculate", { grade: "A" }], ["mint condition", { grade: "A" }],
  ["good condition", { grade: "B" }], ["grade b", { grade: "B" }], ["b grade", { grade: "B" }], ["tidy", { grade: "B" }],
  ["private", { seller: "private" }], ["private seller", { seller: "private" }], ["private sale", { seller: "private" }], ["business", { seller: "business" }], ["dealer", { seller: "business" }],
  ["ex fleet", { seller: "business" }], ["fleet", { seller: "business" }], ["gst", { seller: "business" }],
];
const STOP = new Set(["a", "an", "the", "in", "at", "on", "near", "around", "with", "for", "and", "or", "of", "to", "from", "any", "my", "me", "i", "want", "looking", "buy", "find", "show", "please", "some", "is", "under", "over", "below", "above", "less", "than", "more", "up", "km", "kms", "k", "$", "-", "+", "#", "lot", "listing", "listings", "sale", "auction", "auctions", "condition", "used", "second", "hand", "secondhand"]);
// Model names that are everyday words: only matched when the make is in the query too.
const GENERIC_MODELS = new Set(["ute", "box", "plant", "flat top", "drop deck", "forklift", "car carrier", "switch", "getaway", "sprint", "daily", "rapid", "journey", "conquest", "element", "excel", "explorer", "pinnacle", "outsider", "city", "master", "partner", "expert", "express", "spirit", "freighter", "seal", "liberty", "defender", "ranger", "chief", "scout", "monster", "bonneville"]);
// Makes that are everyday words: ignored when the query also names a category ("mini excavator", "case loader").
const GENERIC_MAKES = new Set(["Mini", "Case", "Indian", "International", "Supreme", "Savage", "Crusader", "Lotus", "Windsor", "Ram", "RAM", "MAN"]);
// Nicknames people use for models
const MODEL_NICKNAMES: [string, string, string, string?][] = [
  ["prado", "Toyota", "LandCruiser Prado"], ["70 series", "Toyota", "LandCruiser 70"], ["79 series", "Toyota", "LandCruiser 70"], ["76 series", "Toyota", "LandCruiser 70"], ["200 series", "Toyota", "LandCruiser"],
  ["300 series landcruiser", "Toyota", "LandCruiser"], ["cruiser 70", "Toyota", "LandCruiser 70"], ["gu", "Nissan", "Patrol"], ["gq", "Nissan", "Patrol"], ["np300", "Nissan", "Navara"], ["d22", "Nissan", "Navara"],
  ["vf", "Holden", "Commodore"], ["ve", "Holden", "Commodore"], ["vz", "Holden", "Commodore"], ["xr6", "Ford", "Falcon", "keep"], ["xr8", "Ford", "Falcon", "keep"], ["fg", "Ford", "Falcon"], ["ba falcon", "Ford", "Falcon"],
  ["hiace", "Toyota", "HiAce"], ["wrx", "Subaru", "WRX"], ["gti", "Volkswagen", "Golf", "keep"], ["model y", "Tesla", "Model Y"], ["model 3", "Tesla", "Model 3"],
  ["mazda 2", "Mazda", "Mazda2"], ["mazda 3", "Mazda", "Mazda3"], ["mazda 6", "Mazda", "Mazda6"], ["mazda2", "Mazda", "Mazda2"], ["mazda3", "Mazda", "Mazda3"], ["mazda6", "Mazda", "Mazda6"],
  ["gs", "BMW", "R 1250 GS"], ["fatboy", "Harley-Davidson", "Fat Boy"], ["tenere", "Yamaha", "Ténéré 700"], ["t7", "Yamaha", "Ténéré 700"],
];

let PHRASES: Phrase[] | null = null;
function phrases(): Phrase[] {
  if (PHRASES) return PHRASES;
  const list: Phrase[] = [];
  const add = (text: string, act: Action) => { const w = norm(text).split(" ").filter(Boolean); if (w.length) list.push({ words: w, act }); };
  Object.entries(STATE_WORDS).forEach(([w, st]) => add(w, { state: st }));
  KIND_WORDS.forEach(([w, cat, type]) => add(w, type ? { cat, type } : { cat }));
  FLAG_WORDS.forEach(([w, act]) => add(w, act));
  Object.keys(MAKES).forEach((m, i) => {
    add(m, { _make: m, _rank: i });
    if (/[\s-]/.test(m)) add(compress(m), { _make: m, _rank: i });
  });
  Object.entries(MAKE_ALIASES).forEach(([w, m]) => add(w, { _make: m, _rank: 50 }));
  Object.entries(MAKES).forEach(([make, cats], i) => {
    for (const models of Object.values(cats)) for (const model of models!) {
      const act = { _make: make, _model: model, _rank: i };
      const variants = new Set([norm(model), compress(model), spaced(model)]);
      variants.forEach((v) => add(v, act));
    }
  });
  MODEL_NICKNAMES.forEach(([w, make, model, keep]) => add(w, { _make: make, _model: model, _rank: 0, _keep: !!keep }));
  // longest phrases first; among equal length, popular makes first
  // (states, categories and options win over a make or model spelt the same, e.g. "ute", "forklift")
  list.sort((a, b) => b.words.length - a.words.length || (a.act._rank ?? -1) - (b.act._rank ?? -1));
  PHRASES = list;
  return list;
}

export interface Parsed { f: SearchFilters; parts: string[]; rest: string }

/** Turns what someone types into filters. Unknown words stay as keywords. */
export function parseQuery(input: string): Parsed {
  const f: SearchFilters = {};
  let s = " " + norm(input || "") + " ";
  const num = (v: string, unit?: string) => { let n = parseFloat(v); if (unit === "k") n *= 1000; if (unit === "m") n *= 1000000; return n; };
  const year = (v: string) => { const y = Number(v); return y >= 1950 && y <= new Date().getFullYear() + 1 ? y : null; };
  const price = (v: string, unit?: string) => { let n = num(v, unit); if (!unit && n < 1000) n *= 1000; return Math.round(n); };
  const take = (re: RegExp, fn: (...m: string[]) => boolean | void) => { s = s.replace(re, (...m) => (fn(...(m as string[])) === false ? m[0] : " ")); };
  let catHint: string | undefined;

  // lot number
  take(/\s(?:lot\s*#?|#)\s*(\d{5,7})(?=\s)/g, (_, n) => { f.q = n; });
  if (/^\s*\d{5,7}\s*$/.test(s)) { f.q = s.trim(); s = " "; }
  // kilometres and hours
  take(/\slow\s*(?:km|kms|kilometres|kilometers|k)(?=\s)/g, () => { f.km = "100000"; });
  take(/\s(?:(?:under|below|less than|max|maximum|up to|<)\s*)?(\d+(?:\.\d+)?)\s*(k)?\s*(?:km|kms|kilometres|kilometers|klms)(?=\s)/g, (_, v, u) => { f.km = String(Math.round(num(v, u))); });
  take(/\s(?:(?:under|below|less than|max|up to|<)\s*)?(\d{1,6})\s*(?:hrs|hours|hr)(?=\s)/g, (_, v) => { f.hrs = v; });
  // engine size
  take(/\s(?:(under|below|up to|max|<|over|above|min|>)\s*)?(\d{2,4})\s*cc(?=\s)/g, (_, cmp, v) => {
    const n = Number(v);
    if (cmp && /under|below|up|max|</.test(cmp)) f.ccmax = v; else if (cmp) f.ccmin = v;
    else { f.ccmin = String(Math.floor(n * 0.9)); f.ccmax = String(Math.ceil(n * 1.1)); }
    catHint = "motorbikes";
  });
  // berths and length
  take(/\s(?:sleeps\s*(\d{1,2})|(\d{1,2})\s*(?:berth|berths|sleeper))(?=\s)/g, (_, a, b) => { f.berths = a || b; catHint = "caravans"; });
  take(/\s(?:(under|up to|max|less than|below)\s*)?(\d{1,2}(?:\.\d)?)\s*(m|metre|metres|meter|meters|ft|foot|feet)(?=\s)/g, (_, cmp, v, unit) => {
    const m = /^f/.test(unit) ? Number(v) * 0.3048 : Number(v);
    const r = (x: number) => String(Math.round(x * 10) / 10);
    if (cmp) f.lenmax = r(m); else { f.lenmin = r(m * 0.85); f.lenmax = r(m * 1.15); }
  });
  // years
  take(/\s(19[5-9]\d|20[0-4]\d)\s*(?:-|to)\s*(19[5-9]\d|20[0-4]\d)(?=\s)/g, (_, a, b) => { if (!year(a) || !year(b)) return false; f.ymin = String(Math.min(+a, +b)); f.ymax = String(Math.max(+a, +b)); });
  take(/\s(?:after|from|since|newer than|post|>)\s*(19[5-9]\d|20[0-4]\d)(?=\s)/g, (_, y) => { if (!year(y)) return false; f.ymin = y; });
  take(/\s(19[5-9]\d|20[0-4]\d)\s*(?:\+|onwards|or newer|and newer|or later)(?=\s)/g, (_, y) => { if (!year(y)) return false; f.ymin = y; });
  take(/\s(?:before|older than|pre|until|<)\s*(19[5-9]\d|20[0-4]\d)(?=\s)/g, (_, y) => { if (!year(y)) return false; f.ymax = y; });
  // prices
  take(/\s\$?(\d+(?:\.\d+)?)\s*(k|m)?\s*(?:-|to)\s*\$?(\d+(?:\.\d+)?)\s*(k|m)?(?=\s)/g, (_, a, ua, b, ub) => {
    const lo = price(a, ua || ub), hi = price(b, ub);
    if (!(hi > lo)) return false;
    f.min = String(lo); f.max = String(hi);
  });
  take(/\s(?:under|below|less than|max|maximum|up to|cheaper than|budget|<=?)\s*\$?(\d+(?:\.\d+)?)\s*(k|m)?(?=\s)/g, (_, v, u) => { f.max = String(price(v, u)); });
  take(/\s(?:over|above|more than|min|minimum|at least|from|>=?)\s*\$?(\d+(?:\.\d+)?)\s*(k|m)?(?=\s)/g, (_, v, u) => { f.min = String(price(v, u)); });
  take(/\s\$(\d+(?:\.\d+)?)\s*(k|m)?(?=\s)/g, (_, v, u) => { f.max = String(price(v, u)); });
  take(/\s(\d+(?:\.\d+)?)(k)(?=\s)/g, (_, v, u) => { f.max = String(price(v, u)); });
  // a single year
  take(/\s(19[5-9]\d|20[0-4]\d)(?=\s)/g, (_, y) => { if (!year(y)) return false; f.ymin = y; f.ymax = y; });

  // words and phrases (longest first)
  const tokens = s.trim().split(" ").filter(Boolean);
  const used = new Array(tokens.length).fill(false);
  const list = phrases();
  let make: string | undefined, model: string | undefined, kindFound = false;
  const pending: { i: number; len: number; act: Action }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (used[i]) continue;
    for (const p of list) {
      const n = p.words.length;
      if (i + n > tokens.length) continue;
      let hit = true;
      for (let j = 0; j < n; j++) if (used[i + j] || tokens[i + j] !== p.words[j]) { hit = false; break; }
      if (!hit) continue;
      pending.push({ i, len: n, act: p.act });
      for (let j = 0; j < n; j++) used[i + j] = true;
      if (p.act.cat) kindFound = true;
      break;
    }
  }
  // resolve makes and models: explicit makes first, then models (restricted to that make)
  const makeHits = pending.filter((p) => p.act._make && !p.act._model);
  const strongMakes = makeHits.filter((p) => !(GENERIC_MAKES.has(p.act._make!) && kindFound));
  if (strongMakes.length) make = strongMakes[0].act._make;
  for (const p of pending) {
    const a = p.act;
    if (a._make && !a._model) {
      if (a._make !== make) for (let j = 0; j < p.len; j++) used[p.i + j] = false; // left as a keyword
      continue;
    }
    if (a._model) {
      const generic = GENERIC_MODELS.has(a._model.toLowerCase()) || /^\d+$/.test(a._model) || /^[a-z]{1,2}$/i.test(a._model);
      const keep = () => { if (a._keep) for (let j = 0; j < p.len; j++) used[p.i + j] = false; };
      // a more specific model of the same make wins ("land cruiser 79 series")
      if (model && a._make === make && a._model !== model && a._model.toLowerCase().startsWith(model.toLowerCase())) { model = a._model; keep(); continue; }
      if (model && a._make === make && a._model === model) { for (let j = 0; j < p.len; j++) used[p.i + j] = !a._keep; continue; }
      if ((make && a._make !== make) || (!make && generic) || model) {
        // a model of another make: try the same words as a model of the named make
        const alt = make && !model ? Object.values(MAKES[make] || {}).flat().find((m) => norm(m) === tokens.slice(p.i, p.i + p.len).join(" ") || compress(m) === tokens.slice(p.i, p.i + p.len).join("")) : undefined;
        if (alt) { model = alt; continue; }
        for (let j = 0; j < p.len; j++) used[p.i + j] = false;
        continue;
      }
      make = a._make; model = a._model; keep();
      continue;
    }
    for (const [k, v] of Object.entries(a)) if (!k.startsWith("_") && v != null && !(f as Record<string, string>)[k]) (f as Record<string, string>)[k] = v as string;
  }
  // numeric or short models need their make, e.g. "toyota 86", "porsche 911", "lexus is"
  if (make && !model) {
    for (let i = 0; i < tokens.length; i++) {
      if (used[i]) continue;
      const hit = Object.values(MAKES[make] || {}).flat().find((m) => compress(m) === tokens[i] || norm(m) === tokens[i]);
      if (hit) { model = hit; used[i] = true; break; }
    }
  }
  if (make) f.make = make;
  if (model) f.model = model;
  if (!f.cat && make) { const c = categoryOf(make, model); if (c) f.cat = c; }
  if (!f.cat && catHint) f.cat = catHint;
  if (f.type && !f.cat) delete f.type;

  const rest = tokens.filter((t, i) => !used[i] && !STOP.has(t) && !/^[$<>+#-]+$/.test(t)).join(" ");
  if (rest && !f.q) f.q = rest; else if (rest && f.q) f.q = `${f.q} ${rest}`;
  const clean = cleanFilters(f as Record<string, unknown>);
  return { f: clean, parts: describeParts(clean), rest };
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------
export function describeParts(f: SearchFilters): string[] {
  const p: string[] = [];
  const n = (v?: string) => Number(v).toLocaleString("en-AU");
  if (f.make || f.model) p.push([f.make, f.model].filter(Boolean).join(" "));
  if (f.cat === "cheap") p.push("Under $5,000");
  else if (f.type) p.push(kindLabel(f.cat, f.type) || f.type);
  else if (f.cat && !(f.make && f.model)) p.push(CAT[f.cat]?.label || f.cat);
  if (f.ymin && f.ymin === f.ymax) p.push(f.ymin);
  else if (f.ymin && f.ymax) p.push(`${f.ymin}–${f.ymax}`);
  else if (f.ymin) p.push(`${f.ymin} or newer`);
  else if (f.ymax) p.push(`${f.ymax} or older`);
  if (f.min && f.max) p.push(`${money(+f.min)}–${money(+f.max)}`);
  else if (f.max) p.push(`Under ${money(+f.max)}`);
  else if (f.min) p.push(`Over ${money(+f.min)}`);
  if (f.km) p.push(`Under ${n(f.km)} km`);
  if (f.hrs) p.push(`Under ${n(f.hrs)} hours`);
  if (f.ccmin && f.ccmax) p.push(`${f.ccmin}–${f.ccmax} cc`); else if (f.ccmax) p.push(`Up to ${f.ccmax} cc`); else if (f.ccmin) p.push(`${f.ccmin} cc+`);
  if (f.lams) p.push("LAMS approved");
  if (f.lic) p.push(f.lic === "C" ? "Car licence" : `${f.lic} licence or below`);
  if (f.berths) p.push(`Sleeps ${f.berths}+`);
  if (f.lenmin && f.lenmax) p.push(`${f.lenmin}–${f.lenmax} m`); else if (f.lenmax) p.push(`Up to ${f.lenmax} m`); else if (f.lenmin) p.push(`${f.lenmin} m+`);
  if (f.fuel) p.push(FUELS.find((x) => x[0] === f.fuel)?.[1] || f.fuel);
  if (f.trans) p.push(TRANS.find((x) => x[0] === f.trans)?.[1] || f.trans);
  if (f.drive) p.push(f.drive);
  if (f.state) p.push(f.state);
  if (f.seller) p.push(f.seller === "private" ? "Private sellers" : "Business sellers");
  if (f.nores) p.push("No reserve");
  if (f.buynow) p.push("Buy Now");
  if (f.ending) p.push(ENDINGS.find((e) => e[0] === f.ending)?.[1] || "Ending soon");
  if (f.grade) p.push(f.grade === "A" ? "Grade A" : `Grade ${f.grade} or better`);
  if (f.q) p.push(`“${f.q}”`);
  return p;
}
export const describe = (f: SearchFilters) => describeParts(f).join(" · ");
export function heading(f: SearchFilters) {
  if (f.view === "offers") return "Make an offer.";
  if (f.view === "closed") return "Recently closed.";
  if (f.make && f.model) return `${f.make} ${f.model}.`;
  if (f.make) return `${f.make}.`;
  if (f.type) return `${kindLabel(f.cat, f.type)}s.`.replace(/ss\.$/, "s.").replace(/ys\.$/, "ys.");
  if (f.cat === "cheap") return "Under $5,000.";
  if (f.cat && CAT[f.cat]) return `${CAT[f.cat].label}.`;
  if (f.q) return "Search results.";
  return "Live auctions.";
}

// ---------------------------------------------------------------------------
// Typeahead
// ---------------------------------------------------------------------------
export interface Facets { total?: number; cats?: Record<string, number>; cheap?: number; makes?: Record<string, number>; models?: Record<string, number>; states?: Record<string, number>; types?: Record<string, number>; fuels?: Record<string, number>; trans?: Record<string, number>; drives?: Record<string, number> }
export interface Suggestion { kind: "smart" | "model" | "make" | "category" | "type" | "state" | "lot" | "keyword"; label: string; sub?: string; f: SearchFilters; count?: number; href: string }

interface Candidate { label: string; sub: string; keys: string[]; f: SearchFilters; kind: Suggestion["kind"]; count?: number; weight: number }
let CANDIDATES: Candidate[] | null = null;
function candidates(): Candidate[] {
  if (CANDIDATES) return CANDIDATES;
  const out: Candidate[] = [];
  CATEGORIES.forEach((c) => {
    out.push({ label: c.label, sub: "Category", keys: [norm(c.label), norm(c.short), ...KIND_WORDS.filter((k) => k[1] === c.key && !k[2]).map((k) => norm(k[0]))], f: { cat: c.key }, kind: "category", weight: 40 });
    c.kinds.forEach(([k, label]) => out.push({ label, sub: c.short, keys: [norm(label), ...KIND_WORDS.filter((w) => w[1] === c.key && w[2] === k).map((w) => norm(w[0]))], f: { cat: c.key, type: k }, kind: "type", weight: 30 }));
  });
  Object.entries(MAKES).forEach(([make, cats], i) => {
    const catKeys = Object.keys(cats);
    out.push({ label: make, sub: catKeys.length === 1 ? CAT[catKeys[0]].short : "All models", keys: [norm(make), compress(make)], f: { make }, kind: "make", weight: 35 - Math.min(i, 30) * 0.3 });
    for (const [cat, models] of Object.entries(cats)) for (const model of models!) {
      out.push({ label: `${make} ${model}`, sub: CAT[cat].short, keys: [norm(model), compress(model), spaced(model), norm(`${make} ${model}`), compress(make + model)], f: { make, model, cat }, kind: "model", weight: 25 - Math.min(i, 30) * 0.3 });
    }
  });
  Object.entries(STATE_NAMES).forEach(([st, name]) => out.push({ label: name, sub: "Location", keys: [norm(name), st.toLowerCase()], f: { state: st }, kind: "state", weight: 20 }));
  CANDIDATES = out;
  return out;
}

/** Suggestions for the search bar as someone types. Runs in the browser, no server round trip. */
export function suggest(input: string, facets?: Facets | null, limit = 8): Suggestion[] {
  const text = norm(input || "");
  const out: Suggestion[] = [];
  if (!text) return out;
  if (/^#?\d{5,7}$/.test(text)) out.push({ kind: "lot", label: `Go to lot ${text.replace("#", "")}`, sub: "Lot number", f: {}, href: `/lot/${text.replace("#", "")}` });
  const parsed = parseQuery(input);
  const structured = Object.keys(parsed.f).some((k) => k !== "q");
  // the words before the one being typed
  const tokens = text.split(" ");
  const frags = [tokens.slice(-3).join(" "), tokens.slice(-2).join(" "), tokens.slice(-1).join(" ")].filter((x, i, a) => x && a.indexOf(x) === i);
  const countOf = (c: Candidate) => {
    if (!facets) return undefined;
    if (c.kind === "category") return facets.cats?.[c.f.cat!] ?? 0;
    if (c.kind === "make") return facets.makes?.[c.f.make!] ?? 0;
    if (c.kind === "model") return facets.models?.[`${c.f.make}|${c.f.model}`] ?? 0;
    if (c.kind === "state") return facets.states?.[c.f.state!] ?? 0;
    return undefined;
  };
  const scored: { c: Candidate; score: number; frag: string }[] = [];
  for (const c of candidates()) {
    let best = 0, bestFrag = "";
    for (const frag of frags) {
      if (frag.length < 2 && !/^\d$/.test(frag)) continue;
      for (const k of c.keys) {
        let sc = 0;
        if (k === frag) sc = 100; else if (k.startsWith(frag)) sc = 70 - Math.min(k.length - frag.length, 20); else if (k.split(" ").some((w) => w.startsWith(frag) && frag.length >= 3)) sc = 45;
        if (sc) { sc += frag.split(" ").length * 8; if (sc > best) { best = sc; bestFrag = frag; } }
      }
    }
    if (!best) continue;
    const cnt = countOf(c);
    // the make already chosen narrows model suggestions
    if (parsed.f.make && c.kind === "model" && c.f.make !== parsed.f.make && !bestFrag.includes(" ")) continue;
    scored.push({ c, score: best + c.weight + (cnt ? Math.min(Math.log2(cnt + 1) * 4, 20) : 0), frag: bestFrag });
  }
  scored.sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  for (const { c, frag } of scored) {
    if (out.length >= limit - 1) break;
    if (seen.has(c.label)) continue;
    seen.add(c.label);
    // keep whatever else was typed ("under 30k qld ...") and add this choice
    const before = text.endsWith(frag) ? text.slice(0, text.length - frag.length) : text;
    const base = parseQuery(before).f;
    const f = cleanFilters({ ...base, ...c.f, ...(c.f.make && base.make && base.make !== c.f.make ? { model: c.f.model } : {}) });
    if (c.kind === "make" && !c.f.model) delete f.model;
    const cnt = countOf(c);
    out.push({ kind: c.kind, label: c.label, sub: c.sub, f, count: cnt, href: searchHref(f) });
  }
  if (structured) {
    const lbl = parsed.parts.join(" · ");
    if (!out.some((o) => o.label === lbl)) out.unshift({ kind: "smart", label: lbl, sub: "Search", f: parsed.f, href: searchHref(parsed.f) });
  }
  if (!structured || parsed.rest) out.push({ kind: "keyword", label: `Search all vehicles for “${input.trim()}”`, f: parsed.f, href: searchHref(parsed.f) });
  return out.slice(0, limit + 1);
}
