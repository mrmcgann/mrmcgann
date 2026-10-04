import { currentUser } from "@/lib/auth";
import { CAT } from "@/lib/vehicles";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { env } from "@/lib/env";
import { allow, clientIp } from "@/lib/ratelimit";
import { kickOutbox } from "@/lib/notify";
import { finishVehicle, isPlate, isVin, normalizePlate, normalizeVin, REGO_STATES, type RegoVehicle } from "@/lib/rego";

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

// "Sell your vehicle": the plate (or VIN) lookup, the details only the seller knows
// (kilometres, condition), and how to reach them. We call back with a price guide.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const err: Record<string, string> = {};
  const registration = b.registration === "unregistered" ? "unregistered" : "registered";
  const rego = normalizePlate(b.rego), vin = normalizeVin(b.vin), state = String(b.state || "").toUpperCase();
  const kind = CAT[b.kind] ? b.kind : "cars";
  const usage = CAT[kind]?.usage;
  if (registration === "registered" && !isPlate(rego)) err.rego = "Enter the plate.";
  if (!(REGO_STATES as readonly string[]).includes(state)) err.state = "Choose a state.";
  if (vin && !isVin(vin) && vin.length < 5) err.vin = "Check the VIN or chassis number.";
  if (usage !== "none" && !clip(b.odometer, 20)) err.odometer = usage === "hours" ? "Roughly how many hours?" : "Roughly how many kilometres?";
  if (!/^\d{4}$/.test(b.postcode || "")) err.postcode = "Enter a 4-digit postcode.";
  if (!clip(b.name, 120)) err.name = "Tell us your name.";
  if (!clip(b.mobile, 20) && !clip(b.email, 200)) err.mobile = "Add a mobile or an email so we can reach you.";
  if (b.email && !/^\S+@\S+\.\S+$/.test(b.email)) err.email = "Check the email address.";

  // What we know about the vehicle: the lookup (if they used it), then anything they typed.
  const admin = supabaseAdmin();
  let vehicle: RegoVehicle = {};
  let lookupId: string | null = null;
  if (typeof b.lookupId === "string" && /^[0-9a-f-]{36}$/.test(b.lookupId)) {
    const { data: l } = await admin.from("rego_lookups").select("id, plate, state, vin, found, vehicle").eq("id", b.lookupId).maybeSingle();
    if (l?.found && ((l.plate && l.plate === rego && l.state === state) || (!l.plate && l.vin && l.vin === vin))) { vehicle = l.vehicle as RegoVehicle; lookupId = l.id; }
  }
  const typed: RegoVehicle = { year: Number(b.year) || null, make: clip(b.make, 40) || null, model: clip(b.model, 40) || null, variant: clip(b.variant, 60) || null };
  vehicle = finishVehicle({ ...vehicle, ...Object.fromEntries(Object.entries(typed).filter(([, v]) => v)), category: kind as RegoVehicle["category"] });
  if (!lookupId && !(vehicle.make && vehicle.model)) err.make = "Tell us the make and model.";
  if (Object.keys(err).length) return json({ errors: err }, 400);
  if (!(await allow(`appraisal:${await clientIp()}`, 10, 3600))) return fail("Too many requests. Please call us instead.", 429);

  const db = await supabaseServer();
  const user = await currentUser(db);
  const { data, error } = await admin.from("appraisals").insert({
    user_id: user?.id || null, kind, registration, rego: rego || null, state, vin: vehicle.vin || vin || null, vehicle, lookup_id: lookupId,
    odometer: clip(b.odometer, 20) || null, postcode: b.postcode, description: clip(b.description, 2000) || null,
    name: clip(b.name, 120), mobile: clip(b.mobile, 20) || null, email: clip(b.email, 200) || null,
    photo_paths: Array.isArray(b.photos) ? b.photos.filter((p: unknown) => typeof p === "string").slice(0, 12) : [],
  }).select("ref").single();
  if (error) return fail("We couldn't send your request. Please try again.");
  const what = [vehicle.description, registration === "registered" ? `${rego} (${state})` : `unregistered, ${state}`].filter(Boolean).join(" · ");
  await admin.from("outbox").insert({
    channel: "email", to_addr: env.supportEmail, kind: "lead", title: `New vehicle to sell ${data.ref}: ${vehicle.description || rego || "unregistered"}`,
    body: `${what}\n${b.odometer ? `${clip(b.odometer, 20)} ${usage === "hours" ? "hours" : "km"} · ` : ""}postcode ${b.postcode}\n${clip(b.name, 120)} · ${clip(b.mobile, 20)} ${clip(b.email, 200)}\n\n${clip(b.description, 2000)}`,
    link: "/admin/appraisals", dedupe_key: `appraisal:${data.ref}`, priority: 3,
  });
  kickOutbox();
  return json({ ref: data.ref });
}
