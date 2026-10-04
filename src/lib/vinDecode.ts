import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { decodeVinOffline, isVin, normalizeVin } from "@/lib/vin";
import { finishVehicle, type RegoVehicle } from "@/lib/rego";

// Our own free vehicle lookup. No paid provider, and nothing scraped from the states'
// rego checks (their terms forbid automated use). In order:
//   1. our records: a plate we've listed before (checked by our team);
//   2. VIN patterns we've learned from our listings, plus New Zealand's open vehicle
//      register if it has been loaded (scripts/vin-data-nz.mjs);
//   3. NHTSA's free VIN decoder (vPIC), which knows some vehicles sold here;
//   4. the VIN itself: the maker and country (first characters) and model year (10th).
// Each step only fills in what the earlier ones didn't.

export type FreeResult = { found: boolean; complete: boolean; provider: "free"; sources: string[]; vehicle: RegoVehicle };
type Row = Record<string, string | number | null>;

const VPIC_OFF = process.env.VPIC_DISABLED === "true";

function fill(v: RegoVehicle, extra: Partial<RegoVehicle>) {
  const out = v as Record<string, unknown>;
  for (const [k, x] of Object.entries(extra)) if (x != null && x !== "" && (out[k] == null || out[k] === "")) out[k] = x;
  return v;
}

async function vpic(vin: string): Promise<Partial<RegoVehicle>> {
  if (VPIC_OFF) return {};
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) return {};
    const x = ((await r.json()) as { Results?: Row[] }).Results?.[0];
    // Only trust it when it knows both the make and the model (it mostly knows US-market vehicles).
    if (!x || !x.Make || !x.Model) return {};
    const litres = Number(x.DisplacementL);
    return {
      make: String(x.Make), model: String(x.Model), variant: [x.Trim, x.Series].filter(Boolean).join(" ") || null, year: Number(x.ModelYear) || null,
      body: (x.BodyClass as string) || null, fuel: (x.FuelTypePrimary as string) || null, drive: (x.DriveType as string) || null, transmission: (x.TransmissionStyle as string) || null,
      engine: litres ? `${litres.toFixed(1)}L${x.EngineCylinders ? ` ${x.EngineCylinders}-cyl` : ""}` : null,
    };
  } catch {
    return {};
  } finally {
    clearTimeout(t);
  }
}

export async function freeLookup({ plate, state, vin }: { plate?: string | null; state?: string | null; vin?: string | null }): Promise<FreeResult> {
  const db = supabaseAdmin();
  const sources: string[] = [];
  let v: RegoVehicle = {};
  const typedVin = isVin(normalizeVin(vin)) ? normalizeVin(vin) : null;

  if (plate && state) {
    const { data } = await db.rpc("plate_memory", { p_plate: plate, p_state: state });
    const m = ((data || []) as Row[])[0];
    // If they typed a VIN that isn't the one we have for this plate, the plate has moved on: ignore our record.
    if (m && (!typedVin || !m.vin || m.vin === typedVin)) {
      v = {
        vin: (m.vin as string) || null, engineNo: (m.engine_no as string) || null, year: (m.year as number) || null, make: m.make as string, model: (m.model as string) || null,
        variant: (m.variant as string) || null, body: (m.body as string) || null, colour: (m.colour as string) || null, fuel: (m.fuel as string) || null,
        transmission: (m.transmission as string) || null, drive: (m.drive as string) || null, engine: (m.engine as string) || null,
        category: (m.category as RegoVehicle["category"]) || null, kind: (m.kind as string) || null,
        regoExpiry: m.registration === "registered" ? (m.rego_expiry as string) || null : null,
      };
      sources.push("our records");
    }
  }

  const theVin = typedVin || (v.vin && isVin(v.vin) ? v.vin : null);
  if (theVin) {
    fill(v, { vin: theVin });
    const [{ data: pats }, nh] = await Promise.all([db.rpc("vin_pattern", { p_vin: theVin }), vpic(theVin)]);
    const p = ((pats || []) as Row[])[0];
    if (p) {
      fill(v, {
        make: p.make as string, model: p.model as string, variant: (p.variant as string) || null, body: (p.body as string) || null, fuel: (p.fuel as string) || null,
        transmission: (p.transmission as string) || null, drive: (p.drive as string) || null, year: (p.year as number) || null,
        engine: p.engine_cc ? `${(Number(p.engine_cc) / 1000).toFixed(1)}L` : null,
        category: (p.category as RegoVehicle["category"]) || null, kind: (p.kind as string) || null,
      });
      sources.push(p.source === "nzta" ? "nz open data" : "our records");
    }
    if (nh.make) { fill(v, nh); sources.push("nhtsa"); }
    const off = decodeVinOffline(theVin);
    if (off?.make || off?.year) { fill(v, { make: off.make, year: off.year, country: off.country }); sources.push("vin"); }
  }

  const vehicle = finishVehicle(v);
  return { found: !!vehicle.make, complete: !!(vehicle.make && vehicle.model && vehicle.year), provider: "free", sources: [...new Set(sources)], vehicle };
}
