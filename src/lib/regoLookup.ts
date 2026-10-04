import "server-only";
import { finishVehicle, type RegoVehicle } from "@/lib/rego";
import { env } from "@/lib/env";

// Plate (and VIN) lookups against a paid vehicle-data provider. Choose one with
// REGO_LOOKUP_PROVIDER and its key in REGO_LOOKUP_KEY:
//   carregistrationapi  carregistrationapi.com (self-serve, about $0.30 a lookup). Key = your username.
//   autograb            AutoGrab (api.autograb.com.au). Key = your ApiKey. Also does VIN lookups.
// Blue Flag and InfoAgent (NEVDIS data from every state) can be added here once you have their API docs.
// In test mode with no provider set, made-up sample vehicles come back (plate NOTFOUND finds nothing).

export class LookupUnavailable extends Error {}
export type LookupResult = { found: boolean; provider: string; vehicle: RegoVehicle };

const PROVIDER = (process.env.REGO_LOOKUP_PROVIDER || "").toLowerCase();
const KEY = process.env.REGO_LOOKUP_KEY || "";
const TIMEOUT = 12000;

export function lookupProvider() {
  if (PROVIDER && KEY) return PROVIDER;
  return env.testMode ? "test" : null;
}

export async function lookupPlate(plate: string, state: string): Promise<LookupResult> {
  const p = lookupProvider();
  if (p === "carregistrationapi") return carRegistrationApi(plate, state);
  if (p === "autograb") return autograb(`/v2/vehicles/registrations/${encodeURIComponent(plate)}?region=au&state=${state.toLowerCase()}`);
  if (p === "test") return fake(plate);
  throw new LookupUnavailable();
}

export async function lookupVin(vin: string): Promise<LookupResult> {
  const p = lookupProvider();
  if (p === "autograb") return autograb(`/v2/vehicles/${encodeURIComponent(vin)}?region=au`);
  if (p === "test") return fake(vin);
  throw new LookupUnavailable(); // CarRegistrationAPI's Australian lookup is by plate only
}

async function get(url: string, headers: Record<string, string> = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    return await fetch(url, { headers: { Accept: "application/json, text/xml", ...headers }, signal: ctl.signal, cache: "no-store" });
  } catch {
    throw new LookupUnavailable();
  } finally {
    clearTimeout(t);
  }
}

// Text from a field that may be a plain value or { CurrentTextValue: "..." }.
function txt(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") return String(v).trim() || null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    return txt(o.CurrentTextValue ?? o.Value ?? o.value ?? null);
  }
  return null;
}
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const isoDate = (s: string | null) => {
  if (!s) return null;
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/) || null;
  const d = m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

// CarRegistrationAPI (regcheck.org.uk): XML with the vehicle as JSON inside <vehicleJson>.
// Fields differ by state (VIC gives the expiry; QLD gives little more than the VIN).
async function carRegistrationApi(plate: string, state: string): Promise<LookupResult> {
  const url = `https://www.regcheck.org.uk/api/reg.asmx/CheckAustralia?RegistrationNumber=${encodeURIComponent(plate)}&State=${encodeURIComponent(state)}&username=${encodeURIComponent(KEY)}`;
  const r = await get(url);
  const body = await r.text();
  if (!r.ok) {
    if (/not found|no (data|vehicle)|invalid registration/i.test(body)) return { found: false, provider: "carregistrationapi", vehicle: {} };
    throw new LookupUnavailable();
  }
  const m = body.match(/<vehicleJson>([\s\S]*?)<\/vehicleJson>/i);
  if (!m) return { found: false, provider: "carregistrationapi", vehicle: {} };
  let j: Record<string, unknown>;
  try { j = JSON.parse(decode(m[1])); } catch { return { found: false, provider: "carregistrationapi", vehicle: {} }; }
  const desc = txt(j.Description);
  const vehicle = finishVehicle({
    year: Number(txt(j.RegistrationYear)) || null,
    make: txt(j.CarMake) || txt(j.MakeDescription), model: txt(j.CarModel) || txt(j.ModelDescription),
    body: txt(j.BodyStyle), colour: txt(j.Colour), engine: txt(j.Engine), fuel: txt(j.FuelType) || desc,
    transmission: txt(j.Transmission) || desc, vin: txt(j.VechileIdentificationNumber) || txt(j.VehicleIdentificationNumber),
    regoExpiry: isoDate(txt(j.Expiry)), description: desc,
  });
  return { found: !!(vehicle.make || vehicle.vin || desc), provider: "carregistrationapi", vehicle };
}

// AutoGrab: JSON. Plate search returns the vehicle (year, make, model, badge, body, fuel, transmission) plus VIN and colour.
async function autograb(path: string): Promise<LookupResult> {
  const r = await get(`https://api.autograb.com.au${path}`, { ApiKey: KEY });
  if (r.status === 404) return { found: false, provider: "autograb", vehicle: {} };
  if (!r.ok) throw new LookupUnavailable();
  const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
  const v = (j?.vehicle || {}) as Record<string, unknown>;
  if (!j || j.success === false || !v.make) return { found: false, provider: "autograb", vehicle: {} };
  const vehicle = finishVehicle({
    year: Number(v.year) || null, make: txt(v.make), model: txt(v.model), variant: txt(v.badge), body: txt(v.body_type),
    fuel: txt(v.fuel), transmission: txt(v.transmission), drive: txt(v.drive_type), engine: txt(v.engine_type),
    colour: txt(j.colour), vin: txt(j.vin), description: txt(v.title),
  });
  return { found: true, provider: "autograb", vehicle };
}

// Test mode: made-up vehicles, so the form can be tried without a provider account.
const SAMPLES: RegoVehicle[] = [
  { year: 2017, make: "Ford", model: "Ranger", variant: "XLT 3.2 (4x4)", body: "Dual Cab Utility", colour: "White", fuel: "Diesel", transmission: "Automatic", drive: "4x4", engine: "3.2L 5-cyl", vin: "MNAUMFF50HW000001", engineNo: "SA2W000001" },
  { year: 2015, make: "Toyota", model: "Corolla", variant: "Ascent", body: "Sedan", colour: "Silver", fuel: "Petrol", transmission: "CVT", engine: "1.8L 4-cyl", vin: "JTNKU3JE60J000002", engineNo: "2ZR0000002" },
  { year: 2019, make: "Isuzu", model: "NPR", variant: "45-155", body: "Tipper", colour: "White", fuel: "Diesel", transmission: "Manual", engine: "5.2L 4-cyl", vin: "JALNPR85000000003", engineNo: "4HK1000003" },
  { year: 2020, make: "Yamaha", model: "MT-07", variant: "LAMS", body: "Motor Cycle", colour: "Grey", fuel: "Petrol", transmission: "Manual", engine: "689cc", vin: "JYARM33E00A000004" },
];
async function fake(key: string): Promise<LookupResult> {
  if (/^NOTFOUND/.test(key)) return { found: false, provider: "test", vehicle: {} };
  const s = SAMPLES[[...key].reduce((a, c) => a + c.charCodeAt(0), 0) % SAMPLES.length];
  const expiry = new Date(Date.now() + 150 * 86400000).toISOString().slice(0, 10);
  return { found: true, provider: "test", vehicle: { ...finishVehicle({ ...s, regoExpiry: expiry, registered: true }), engineNo: s.engineNo || null, test: true } };
}
