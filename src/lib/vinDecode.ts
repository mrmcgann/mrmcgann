import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { decodeVinOffline, isVin, normalizeVin } from "@/lib/vin";
import { finishVehicle, type RegoVehicle } from "@/lib/rego";

// Our own free vehicle lookup, Australian only. No paid provider, no overseas data, and nothing
// scraped from the states' rego checks (their terms forbid automated use). In order:
//   1. our records: a plate we've listed before (checked by our team);
//   2. VIN patterns learned from vehicles we've listed;
//   3. the VIN itself: the maker and where it was built (first characters) and model year (10th).
// Each step only fills in what the earlier ones didn't.

export type FreeResult = { found: boolean; complete: boolean; provider: "free"; sources: string[]; vehicle: RegoVehicle };
type Row = Record<string, string | number | null>;

function fill(v: RegoVehicle, extra: Partial<RegoVehicle>) {
  const out = v as Record<string, unknown>;
  for (const [k, x] of Object.entries(extra)) if (x != null && x !== "" && (out[k] == null || out[k] === "")) out[k] = x;
  return v;
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
    const { data: pats } = await db.rpc("vin_pattern", { p_vin: theVin });
    const p = ((pats || []) as Row[])[0];
    if (p) {
      fill(v, {
        make: p.make as string, model: p.model as string, variant: (p.variant as string) || null, body: (p.body as string) || null, fuel: (p.fuel as string) || null,
        transmission: (p.transmission as string) || null, drive: (p.drive as string) || null, year: (p.year as number) || null,
        engine: p.engine_cc ? `${(Number(p.engine_cc) / 1000).toFixed(1)}L` : null,
        category: (p.category as RegoVehicle["category"]) || null, kind: (p.kind as string) || null,
      });
      sources.push("our records");
    }
    const off = decodeVinOffline(theVin);
    if (off?.make || off?.year) { fill(v, { make: off.make, year: off.year, country: off.country }); sources.push("vin"); }
  }

  const vehicle = finishVehicle(v);
  return { found: !!vehicle.make, complete: !!(vehicle.make && vehicle.model && vehicle.year), provider: "free", sources: [...new Set(sources)], vehicle };
}
