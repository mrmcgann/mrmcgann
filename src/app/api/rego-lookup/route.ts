import { allow, clientIp } from "@/lib/ratelimit";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { isPlate, isVin, normalizePlate, normalizeVin, publicVehicle, REGO_STATES, type RegoVehicle } from "@/lib/rego";
import { lookupPlate, lookupProvider, lookupVin, LookupUnavailable } from "@/lib/regoLookup";

const DAILY_CAP = Number(process.env.REGO_LOOKUP_DAILY_CAP || 300);
const UNAVAILABLE = "We can't look vehicles up right now. Enter the details yourself.";

// Sell form: type a plate (and state), or a VIN for an unregistered vehicle, and get the
// vehicle's details back to prefill the form. Lookups cost money, so results are reused for
// 30 days and limited per person and per day. The full VIN never leaves the server.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const plate = normalizePlate(b.plate), state = String(b.state || "").toUpperCase(), vin = normalizeVin(b.vin);
  const byVin = !plate && !!vin;
  if (byVin ? !isVin(vin) : !isPlate(plate)) return fail(byVin ? "Check the VIN: it's 17 letters and numbers." : "Enter the plate as it appears on the vehicle.");
  if (!byVin && !(REGO_STATES as readonly string[]).includes(state)) return fail("Choose the state it's registered in.");
  if (!lookupProvider()) return fail(UNAVAILABLE, 503);

  const ip = await clientIp();
  if (!(await allow(`rego:${ip}`, 10, 3600)) || !(await allow(`rego-day:${ip}`, 25, 86400))) {
    return fail("That's a lot of lookups. Enter the details yourself, or call us.", 429);
  }

  const admin = supabaseAdmin();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  let q = admin.from("rego_lookups").select("id, found, vehicle").gte("created_at", since).order("created_at", { ascending: false }).limit(1);
  q = byVin ? q.eq("vin", vin).is("plate", null) : q.eq("plate", plate).eq("state", state);
  const { data: hit } = await q.maybeSingle();
  if (hit) return json({ found: hit.found, id: hit.id, vehicle: hit.found ? publicVehicle(hit.vehicle as RegoVehicle) : null });

  if (!(await allow("rego:all", DAILY_CAP, 86400))) return fail(UNAVAILABLE, 503);
  try {
    const r = byVin ? await lookupVin(vin) : await lookupPlate(plate, state);
    const vehicle = { ...r.vehicle, registered: byVin ? null : r.found ? (r.vehicle.registered ?? true) : null };
    const { data: row } = await admin.from("rego_lookups").insert({
      plate: byVin ? null : plate, state: byVin ? null : state, vin: byVin ? vin : vehicle.vin || null, provider: r.provider, found: r.found, vehicle,
    }).select("id").single();
    return json({ found: r.found, id: row?.id || null, vehicle: r.found ? publicVehicle(vehicle) : null });
  } catch (e) {
    if (e instanceof LookupUnavailable) return fail(UNAVAILABLE, 503);
    throw e;
  }
}
