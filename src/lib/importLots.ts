// Bulk upload: turns spreadsheet rows (a fleet's vehicle list) into draft listings.
// Shared by the admin page (preview) and the server (import). Everything is a draft:
// staff still photograph each vehicle, check it against the listing and publish it.
import { CAT, type CategoryKey } from "./vehicles.ts";
import { categoryFor, normalizePlate, tidyDrive, tidyFuel, tidyMake, tidyModel, tidyTransmission, REGO_STATES } from "./rego.ts";
import { isVin, normalizeVin } from "./vin.ts";

export const IMPORT_COLUMNS: [string, string][] = [
  ["year", "Year"], ["make", "Make"], ["model", "Model"], ["variant", "Variant"], ["body", "Body"], ["colour", "Colour"],
  ["transmission", "Transmission"], ["fuel", "Fuel"], ["drive", "Drive"], ["odometer", "Odometer (km)"], ["hours", "Hours"],
  ["vin", "VIN"], ["registration", "Registered or unregistered"], ["rego_plate", "Rego plate"], ["rego_state", "Rego state"], ["rego_expiry", "Rego expiry (YYYY-MM-DD)"],
  ["suburb", "Suburb"], ["state", "State"], ["postcode", "Postcode"], ["start_price", "Starting bid"], ["buy_now_price", "Buy Now price"], ["reserve", "Reserve"],
  ["keys", "Keys"], ["known_faults", "Known faults"], ["service_history", "Service history"], ["category", "Category"], ["title", "Title (optional)"],
];
const ALIASES: Record<string, string> = {
  plate: "rego_plate", rego: "rego_plate", registration_number: "rego_plate", kms: "odometer", km: "odometer", kilometres: "odometer", odo: "odometer",
  transmission_type: "transmission", trans: "transmission", "fuel_type": "fuel", location: "suburb", reserve_price: "reserve", start: "start_price",
  starting_bid: "start_price", buy_now: "buy_now_price", rego_expiry_date: "rego_expiry", expiry: "rego_expiry", vin_number: "vin", chassis: "vin",
  "registered_or_unregistered": "registration", "odometer_km": "odometer", "rego_expiry_yyyy_mm_dd": "rego_expiry", "title_optional": "title",
};
const key = (h: string) => { const k = h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""); return ALIASES[k] || k; };

export type ImportRow = {
  lot: Record<string, unknown>;      // columns for public.lots
  reserve: number | null;            // goes to lot_private
  problems: string[];                // shown in the preview; rows with problems aren't imported
};

const int = (v: string | undefined) => { const t = String(v ?? "").trim(); const n = Number(t.replace(/[^0-9.]/g, "")); return t && Number.isFinite(n) ? Math.round(n) : null; };

export function rowsToLots(table: string[][]): ImportRow[] {
  if (table.length < 2) return [];
  const head = table[0].map(key);
  return table.slice(1, 501).map((cells) => {
    const r: Record<string, string> = Object.fromEntries(IMPORT_COLUMNS.map(([k]) => [k, ""]));
    head.forEach((h, i) => { r[h] = (cells[i] ?? "").trim(); });
    const problems: string[] = [];
    const make = tidyMake(r.make);
    const model = tidyModel(make, r.model);
    const year = int(r.year);
    if (!make || !model) problems.push("needs a make and model");
    if (year != null && (year < 1900 || year > new Date().getFullYear() + 1)) problems.push("check the year");
    const vin = normalizeVin(r.vin);
    if (r.vin && !isVin(vin)) problems.push("the VIN isn't 17 valid characters (leave it out for older chassis numbers)");
    const state = (r.state || r.rego_state || "").toUpperCase();
    if (state && !(REGO_STATES as readonly string[]).includes(state)) problems.push("state must be QLD, NSW, VIC, WA, SA, TAS, ACT or NT");
    const regoState = (r.rego_state || state).toUpperCase();
    const plate = normalizePlate(r.rego_plate);
    const reg = /^unreg|^no$|^n$/i.test(r.registration) ? "unregistered" : /^reg|^yes$|^y$/i.test(r.registration) ? "registered" : plate ? "registered" : null;
    const expiry = /^\d{4}-\d{2}-\d{2}$/.test(r.rego_expiry) ? r.rego_expiry : null;
    if (r.rego_expiry && !expiry) problems.push("write the rego expiry as YYYY-MM-DD");
    const cat = (r.category && CAT[r.category.toLowerCase() as CategoryKey]) ? r.category.toLowerCase() as CategoryKey : null;
    const fromBody = categoryFor(r.body, make, model);
    const category: CategoryKey = cat || fromBody.category;
    const title = r.title || [year, make, model, r.variant].filter(Boolean).join(" ");
    const lot: Record<string, unknown> = {
      status: "draft", title: title.slice(0, 140) || "Untitled vehicle", category, vehicle_type: CAT[category]?.silhouette || "car", kind: cat ? null : fromBody.kind,
      backdrop: CAT[category]?.backdrop || "sun", year, make, model, variant: r.variant || null, body: r.body || null, colour: r.colour || null,
      transmission: tidyTransmission(r.transmission), fuel: tidyFuel(r.fuel), drive: tidyDrive(r.drive), odometer: int(r.odometer), hours: int(r.hours),
      vin: vin && isVin(vin) ? vin : null, registration: reg, rego_plate: plate || null, rego_state: plate ? regoState || null : null, rego_expiry: expiry,
      suburb: r.suburb || null, state: state || null, postcode: /^\d{4}$/.test(r.postcode) ? r.postcode : null,
      start_price: int(r.start_price) ?? 100, buy_now_price: int(r.buy_now_price), keys: int(r.keys),
      known_faults: r.known_faults || null, service_history: r.service_history || null,
    };
    return { lot, reserve: int(r.reserve), problems };
  });
}

export const importTemplate = () => IMPORT_COLUMNS.map(([, h]) => h).join(",") + "\r\n" +
  "2019,Toyota,HiLux,SR 4x4,Dual cab ute,White,Auto,Diesel,4WD,148000,,MR0HA3CD100000001,Registered,ABC123,QLD,2027-03-31,Toowoomba,QLD,4350,1000,,22000,2,,Full Toyota history,utes,\r\n";
