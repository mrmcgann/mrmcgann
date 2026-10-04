import { allow, clientIp } from "@/lib/ratelimit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { isPlate, isVin, normalizePlate, normalizeVin, publicVehicle, REGO_STATES, type RegoVehicle } from "@/lib/rego";
import { lookupPlate, lookupProvider, lookupVin, LookupUnavailable } from "@/lib/regoLookup";
import { freeLookup } from "@/lib/vinDecode";

const DAILY_CAP = Number(process.env.REGO_LOOKUP_DAILY_CAP || 300);

// Sell form and listing editor: plate and state, and/or the VIN, in; whatever we can find out
// about the vehicle back, to fill in the form. Our own free lookup by default (our records,
// learned VIN patterns, the VIN itself); a paid provider only if one is
// switched on. Results are kept for 30 days. The full VIN never leaves the server.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const plate = normalizePlate(b.plate), state = String(b.state || "").toUpperCase(), vin = normalizeVin(b.vin);
  const hasPlate = isPlate(plate) && (REGO_STATES as readonly string[]).includes(state);
  if (!hasPlate && !isVin(vin)) {
    if (plate && !(REGO_STATES as readonly string[]).includes(state)) return fail("Choose the state it's registered in.");
    return fail(vin ? "Check the VIN: it's 17 letters and numbers. For an older chassis number, enter the details yourself." : "Enter the plate and state, or the VIN.");
  }

  const ip = await clientIp();
  if (!(await allow(`rego:${ip}`, 20, 3600)) || !(await allow(`rego-day:${ip}`, 60, 86400))) {
    return fail("That's a lot of lookups. Enter the details yourself, or call us.", 429);
  }

  const admin = supabaseAdmin();
  const paid = lookupProvider();
  const provider = paid && (hasPlate || paid === "autograb" || paid === "test") ? paid : "free";
  // Paid results are kept 30 days; our own lookup gets smarter as we list vehicles, so only a day.
  const since = new Date(Date.now() - (provider === "free" ? 1 : 30) * 86400000).toISOString();
  let q = admin.from("rego_lookups").select("id, found, vehicle").eq("provider", provider).gte("created_at", since).order("created_at", { ascending: false }).limit(1);
  q = hasPlate ? q.eq("plate", plate).eq("state", state) : q.is("plate", null);
  q = isVin(vin) ? q.eq("vin", vin) : provider === "free" ? q.is("vin", null) : q;
  const { data: hit } = provider === "free" && hasPlate && !isVin(vin) ? { data: null } : await q.maybeSingle(); // plate-only free lookups are a quick query of our own records
  if (hit) return json(reply(hit.id, hit.found, hit.vehicle as RegoVehicle, (hit.vehicle as { sources?: string[] })?.sources || []));

  let found = false, vehicle: RegoVehicle = {}, sources: string[] = [];
  if (provider === "free") {
    const r = await freeLookup({ plate: hasPlate ? plate : null, state: hasPlate ? state : null, vin: isVin(vin) ? vin : null });
    ({ found, vehicle, sources } = r);
  } else {
    if (!(await allow("rego:all", DAILY_CAP, 86400))) return fail("We can't look vehicles up right now. Enter the details yourself.", 503);
    try {
      const r = hasPlate ? await lookupPlate(plate, state) : await lookupVin(vin);
      found = r.found; vehicle = { ...r.vehicle, registered: hasPlate && r.found ? (r.vehicle.registered ?? true) : null }; sources = [r.provider];
    } catch (e) {
      if (!(e instanceof LookupUnavailable)) throw e;
      const r = await freeLookup({ plate: hasPlate ? plate : null, state: hasPlate ? state : null, vin: isVin(vin) ? vin : null });
      ({ found, vehicle, sources } = r);
    }
  }
  const { data: row } = await admin.from("rego_lookups").insert({
    plate: hasPlate ? plate : null, state: hasPlate ? state : null, vin: isVin(vin) ? vin : vehicle.vin || null, provider, found, vehicle: { ...vehicle, sources },
  }).select("id").single();
  return json(reply(row?.id || null, found, vehicle, sources));
}

function reply(id: string | null, found: boolean, v: RegoVehicle, sources: string[]) {
  const { sources: _s, ...vehicle } = v as RegoVehicle & { sources?: string[] };
  return { found, id, complete: !!(vehicle.make && vehicle.model && vehicle.year), sources, vehicle: found ? publicVehicle(vehicle) : null };
}
