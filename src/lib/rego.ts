// Plate and VIN lookups for the sell form: shared by the website and the app.
// The server (src/lib/regoLookup.ts) calls the data provider; this file tidies what comes back.
import { CAT, MAKES, canonicalMake, categoryOf, type CategoryKey } from "./vehicles.ts";

export const REGO_STATES = ["QLD", "NSW", "VIC", "WA", "SA", "TAS", "ACT", "NT"] as const;
export type RegoState = (typeof REGO_STATES)[number];

/** What a lookup tells us about a vehicle. The full VIN stays on the server. */
export type RegoVehicle = {
  year?: number | null; make?: string | null; model?: string | null; variant?: string | null; body?: string | null;
  colour?: string | null; fuel?: string | null; transmission?: string | null; engine?: string | null; drive?: string | null;
  regoExpiry?: string | null; registered?: boolean | null; description?: string | null;
  category?: CategoryKey | null; kind?: string | null;
  vin?: string | null; engineNo?: string | null; vinEnding?: string | null; test?: boolean;
};

/** Plates: letters and numbers only, as typed on the plate ("abc-123" → "ABC123"). */
export function normalizePlate(s: unknown) {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 9);
}
export const isPlate = (p: string) => /^[A-Z0-9]{1,9}$/.test(p);

/** 17-character VIN (no I, O or Q). Older vehicles have shorter chassis numbers: enter those by hand. */
export function normalizeVin(s: unknown) {
  return String(s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 17);
}
export const isVin = (v: string) => /^[A-HJ-NPR-Z0-9]{17}$/.test(v);

const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(4wd|awd|2wd|ii|iii|iv|gt|gl|sr|sr5|xlt|xls|xl|ltd|gxl|vx|lx|ex|se|st|rs|ss|ssv|sv6|zr|gli|gx|crd|tdi|v6|v8|abs|lams|suv|dohc)\b/gi, (m) => m.toUpperCase());

export function tidyMake(s?: string | null) {
  if (!s) return null;
  return canonicalMake(s) || title(s.trim());
}
export function tidyModel(make: string | null, s?: string | null) {
  if (!s) return null;
  const t = s.trim();
  const known = make ? Object.values(MAKES[make] || {}).flat() : [];
  return known.find((m) => m.toLowerCase() === t.toLowerCase()) || title(t);
}
export function tidyFuel(s?: string | null) {
  const t = (s || "").toUpperCase();
  if (!t) return null;
  if (/HYBRID/.test(t)) return "Hybrid";
  if (/ELECTRIC|\bEV\b|BATTERY/.test(t)) return "Electric";
  if (/DIESEL/.test(t)) return "Diesel";
  if (/LPG|GAS/.test(t)) return "LPG";
  if (/PETROL|UNLEADED|ULP|PULP|GASOLINE/.test(t)) return "Petrol";
  return title(s!);
}
export function tidyTransmission(s?: string | null) {
  const t = (s || "").toUpperCase();
  if (!t) return null;
  if (/CVT|CONTINUOUS/.test(t)) return "CVT";
  if (/AUTOMATED MANUAL|AMT|DCT|DSG|DUAL CLUTCH/.test(t)) return "Automated manual";
  if (/AUTO/.test(t)) return "Auto";
  if (/MANUAL|MAN\b/.test(t)) return "Manual";
  return title(s!);
}
export function tidyDrive(s?: string | null) {
  const t = (s || "").toUpperCase();
  if (/4X4|4WD|FOUR WHEEL/.test(t)) return "4WD";
  if (/AWD|ALL WHEEL/.test(t)) return "AWD";
  if (/2WD|4X2|RWD|FWD|REAR WHEEL|FRONT WHEEL/.test(t)) return "2WD";
  return null;
}

/** Which of our 10 categories (and sub-type) a body type belongs to. */
export function categoryFor(body?: string | null, make?: string | null, model?: string | null): { category: CategoryKey; kind: string | null } {
  const b = ` ${(body || "").toUpperCase()} `;
  const has = (re: RegExp) => re.test(b);
  if (has(/MOTOR ?CYCLE|MOTORBIKE|\bSCOOTER|\bMOPED|\bQUAD\b|\bATV\b|SIDE ?BY ?SIDE|\bUTV\b/)) {
    return { category: "motorbikes", kind: has(/SCOOTER|MOPED/) ? "scooter" : has(/QUAD|ATV/) ? "atv" : has(/SIDE ?BY|UTV/) ? "utv" : null };
  }
  if (has(/CARAVAN|CAMPER|MOTOR ?HOME|POP ?TOP|FIFTH WHEEL/)) return { category: "caravans", kind: has(/MOTOR ?HOME/) ? "motorhome" : has(/CAMPER/) ? "camper" : has(/POP ?TOP/) ? "pop-top" : null };
  if (has(/\bBOAT\b|VESSEL|JET ?SKI|PERSONAL WATERCRAFT/)) return { category: "boats", kind: has(/JET ?SKI|WATERCRAFT/) ? "jet-ski" : null };
  if (has(/TRAILER|\bSEMI\b|DOLLY/)) return { category: "trailers", kind: has(/BOX/) ? "box" : has(/BOAT/) ? "boat" : has(/HORSE|FLOAT/) ? "horse" : has(/SEMI/) ? "semi" : null };
  if (has(/\bBUS\b|COACH|MINIBUS/)) return { category: "buses", kind: has(/MINI/) ? "minibus" : has(/COACH/) ? "coach" : "bus" };
  if (has(/TRACTOR|EXCAVATOR|LOADER|FORKLIFT|BACKHOE|SKID STEER|GRADER|DOZER/)) return { category: "machinery", kind: null };
  if (has(/PRIME MOVER|TRUCK|TIPPER|PANTECH|TABLE ?TOP|TRAY TOP|\bRIGID\b|CRANE|TANKER|TILT ?TRAY/)) {
    return { category: "trucks", kind: has(/PRIME MOVER/) ? "prime-mover" : has(/TIPPER/) ? "tipper" : has(/PANTECH/) ? "pantech" : has(/TILT/) ? "tilt-tray" : has(/CRANE/) ? "crane" : has(/TANKER/) ? "tanker" : null };
  }
  if (has(/\bVAN\b|PANEL VAN|CREW VAN|WINDOW VAN/)) return { category: "vans", kind: has(/CREW/) ? "crew-van" : "van" };
  if (has(/\bUTE\b|UTILITY|PICK ?UP|CAB ?CHASSIS|DUAL CAB|DOUBLE CAB|CREW CAB|SINGLE CAB|EXTRA CAB|SPACE CAB|KING CAB|SUPER CAB/)) {
    return { category: "utes", kind: has(/CAB ?CHASSIS/) ? "cab-chassis" : has(/DUAL|DOUBLE|CREW/) ? "dual-cab" : has(/EXTRA|SPACE|KING|SUPER/) ? "extra-cab" : has(/SINGLE/) ? "single-cab" : null };
  }
  // Fall back on what the make and model usually are (a HiLux wagon is still a ute-and-4x4 buy).
  const byModel = make ? categoryOf(make, model) : null;
  const category: CategoryKey = byModel && byModel !== "cars" ? byModel : "cars";
  if (category !== "cars") return { category, kind: null };
  return { category, kind: has(/SEDAN/) ? "sedan" : has(/HATCH/) ? "hatch" : has(/WAGON/) ? "wagon" : has(/SUV|SPORT UTILITY/) ? "suv" : has(/COUPE/) ? "coupe" : has(/CONVERTIBLE|CABRIOLET|ROADSTER/) ? "convertible" : has(/PEOPLE MOVER|MPV/) ? "people-mover" : null };
}

/** Fill in category, tidy names and a one-line description from raw provider fields. */
export function finishVehicle(v: RegoVehicle): RegoVehicle {
  const make = tidyMake(v.make);
  const model = tidyModel(make, v.model);
  const { category, kind } = categoryFor(v.body, make, model);
  const year = v.year && v.year > 1900 && v.year <= new Date().getFullYear() + 1 ? Math.round(v.year) : null;
  const out: RegoVehicle = {
    ...v, make, model, year,
    variant: v.variant ? title(v.variant) : null, body: v.body ? title(v.body) : null, colour: v.colour ? title(v.colour) : null,
    fuel: tidyFuel(v.fuel), transmission: tidyTransmission(v.transmission), drive: v.drive ? tidyDrive(v.drive) : tidyDrive(v.description || v.variant),
    category: v.category && CAT[v.category] ? v.category : category, kind: v.kind || kind,
    vin: v.vin ? v.vin.toUpperCase().replace(/[^A-Z0-9]/g, "") : null,
  };
  out.description = [out.year, out.make, out.model, out.variant].filter(Boolean).join(" ") || v.description || null;
  return out;
}

/** What the browser is allowed to see: everything except the full VIN and engine number. */
export function publicVehicle(v: RegoVehicle): RegoVehicle {
  const { vin, engineNo: _engineNo, ...rest } = v;
  return { ...rest, vinEnding: vin && vin.length >= 6 ? vin.slice(-6) : null };
}

/** "2017 Ford Ranger XLT · Dual cab ute · White · Diesel · Auto" */
/** "3 Mar 2027" */
export const expiryDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "");

export function vehicleLine(v: RegoVehicle) {
  const kind = v.category && v.kind ? CAT[v.category]?.kinds.find(([k]) => k === v.kind)?.[1] : null;
  return [kind || v.body, v.colour, v.fuel, v.transmission, v.drive].filter(Boolean).join(" · ");
}
