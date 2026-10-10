import { after } from "next/server";
import { currentUser } from "@/lib/auth";
import { CAT } from "@/lib/vehicles";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { env } from "@/lib/env";
import { allow, clientIp, userAgent } from "@/lib/ratelimit";
import { kickOutbox } from "@/lib/notify";
import { sendEmail, mailHtml } from "@/lib/email";
import { getSettingsCached } from "@/lib/cache";
import { SELLER_AGREEMENT, SELLER_AGREEMENT_VERSION_LABEL, fillLegal } from "@/content/legal";
import { finishVehicle, type RegoVehicle } from "@/lib/rego";
import { CONDITIONS, OWNER_TYPES, QUESTIONS, SELL_WHEN, WRITE_OFF, cleanSignature, signatureSvg, validateSell } from "@/lib/sellForm";
import { sellerAgreementPdf } from "@/lib/pdf";
import { money } from "@/lib/format";

export const dynamic = "force-dynamic";

// "Sell your vehicle": the whole form in one go, signed. We save it with the signature (drawn, or the typed name for
// someone who can't draw one), keep a PDF of exactly what was signed, email the seller a copy, and tell our team.
export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");
  if (raw.length > 400_000) return fail("That's too much to send at once.", 413);
  let b: Record<string, unknown>;
  try { b = JSON.parse(raw || "{}"); } catch { return fail("Couldn't read that.", 400); }
  const { errors, value: v } = validateSell(b);
  if (Object.keys(errors).length) return json({ errors }, 400);
  const signature = cleanSignature(b.signature);
  if (!(await allow(`sell:${await clientIp()}`, 6, 3600))) return fail("Too many requests from here. Please call us instead.", 429);

  const admin = supabaseAdmin();
  // The plate or VIN lookup (if they used it) tells us more about the vehicle; their own answers win.
  let vehicle: RegoVehicle = {};
  let lookupId: string | null = null;
  if (typeof b.lookupId === "string" && /^[0-9a-f-]{36}$/.test(b.lookupId)) {
    const { data: l } = await admin.from("rego_lookups").select("id, plate, state, vin, found, vehicle").eq("id", b.lookupId).maybeSingle();
    if (l?.found && ((l.plate && l.plate === v.rego && l.state === v.state) || (l.vin && l.vin === v.vin))) {
      const { sources: _s, ...lv } = l.vehicle as RegoVehicle & { sources?: string[] }; void _s; vehicle = lv; lookupId = l.id;
    }
  }
  const typed: RegoVehicle = { year: v.year, make: v.make, model: v.model, variant: v.variant || null, transmission: v.transmission || null, fuel: v.fuel || null, colour: v.colour || null };
  vehicle = finishVehicle({ ...vehicle, ...Object.fromEntries(Object.entries(typed).filter(([, x]) => x)), category: v.category as RegoVehicle["category"] });
  const usage = CAT[v.category].usage;
  const db = await supabaseServer();
  const user = await currentUser(db);
  const signedAt = new Date().toISOString();
  const { data: row, error } = await admin.from("appraisals").insert({
    user_id: user?.id || null, kind: v.category, registration: v.registration, rego: v.rego || null, state: v.state, vin: vehicle.vin || v.vin || null,
    vehicle, lookup_id: lookupId, odometer: v.odometer != null ? String(v.odometer) : null, postcode: v.postcode,
    description: String((v.disclosures as Record<string, unknown>).known_faults || "") || null,
    name: v.name, mobile: v.mobile, email: v.email, photo_paths: v.photos,
    details: { transmission: v.transmission, fuel: v.fuel, colour: v.colour, condition: v.condition, suburb: v.suburb, sell_when: v.sell_when, owner_type: v.owner_type, business: v.business, no_draw: !signature },
    disclosures: v.disclosures, reserve_type: v.reserve_type, reserve_amount: v.reserve_amount,
    signed_name: v.signed_name, signed_at: signedAt, agreement_version: SELLER_AGREEMENT_VERSION_LABEL,
    signed_ip: await clientIp(), signed_ua: (await userAgent()).slice(0, 300),
  }).select("id, ref").single();
  if (error || !row) return fail("We couldn't send your form. Please try again, or call us.");

  // The signature and a copy of exactly what was signed, kept privately.
  const settings = await getSettingsCached();
  const clauses = fillLegal(SELLER_AGREEMENT, settings);
  const label = (list: [string, string, ...unknown[]][], k: string) => list.find(([x]) => x === k)?.[1] || k;
  const d = v.disclosures as Record<string, string>;
  const facts: [string, string][] = [
    ["Vehicle", [v.year, v.make, v.model, v.variant].filter(Boolean).join(" ")],
    ["Type", CAT[v.category].label],
    ["Registration", v.registration === "registered" ? `${v.rego} (${v.state})` : `Unregistered (${v.state})`],
    ...(v.vin ? [["VIN", v.vin] as [string, string]] : []),
    ...(usage !== "none" ? [[usage === "hours" ? "Hours" : "Kilometres", (v.odometer ?? 0).toLocaleString("en-AU")] as [string, string]] : []),
    ["Condition", label(CONDITIONS, v.condition)],
    ...QUESTIONS.map(([k, q]) => [q, String((k === "runs" ? d.starts_and_drives : d[k]) || "")] as [string, string]),
    ...(d.finance === "yes" ? [["Finance owing", `About ${money(Number(d.finance_amount || 0))}${d.lender_name ? ` with ${d.lender_name}` : ""}`] as [string, string]] : []),
    ["Write-off status", label(WRITE_OFF, String(d.write_off))],
    ["Keys", String(d.keys)],
    ["Known faults", String(d.known_faults || "None given")],
    ["Reserve", v.reserve_type === "reserve" ? `${money(v.reserve_amount)} (kept secret from bidders)` : "No reserve: sells to the highest bidder"],
    ["Where it is", `${v.suburb} ${v.state} ${v.postcode}`],
    ["Owner", `${label(OWNER_TYPES, v.owner_type)}${v.business ? ", selling as a business" : ""}`],
    ["When you want to sell", label(SELL_WHEN, v.sell_when)],
    ["Your details", `${v.name}, ${v.mobile}, ${v.email}`],
    ["Photos", `${v.photos.length}`],
  ];
  const folder = `submissions/${row.id}`;
  let signaturePath: string | null = null, agreementPath: string | null = null;
  if (signature) {
    const up = await admin.storage.from("seller-docs").upload(`${folder}/signature.svg`, new TextEncoder().encode(signatureSvg(signature)), { contentType: "image/svg+xml", upsert: true });
    if (!up.error) signaturePath = `${folder}/signature.svg`;
  }
  let pdf: Uint8Array | null = null;
  try {
    pdf = await sellerAgreementPdf({ ref: row.ref, version: SELLER_AGREEMENT_VERSION_LABEL, signedName: v.signed_name, signedAt, signature, facts, clauses });
    const up = await admin.storage.from("seller-docs").upload(`${folder}/agreement.pdf`, pdf, { contentType: "application/pdf", upsert: true });
    if (!up.error) agreementPath = `${folder}/agreement.pdf`;
  } catch { /* the form is saved either way; staff can still see every answer */ }
  if (signaturePath || agreementPath) await admin.from("appraisals").update({ signature_path: signaturePath, agreement_path: agreementPath }).eq("id", row.id);

  // Tell our team, and confirm to the seller (SMS through the queue; the email carries their copy of the agreement).
  const what = `${facts[0][1]} · ${facts[2][1]}${usage !== "none" ? ` · ${(v.odometer ?? 0).toLocaleString("en-AU")} ${usage === "hours" ? "hours" : "km"}` : ""}`;
  await admin.from("outbox").insert([
    { channel: "email", to_addr: env.supportEmail, kind: "lead", title: `Signed sell form ${row.ref}: ${facts[0][1]}`, priority: 3, dedupe_key: `sell:${row.ref}`, link: "/admin/appraisals",
      body: `${what}\n${facts.find(([k]) => k === "Reserve")?.[1]}\n${v.suburb} ${v.state} ${v.postcode} · wants to sell: ${label(SELL_WHEN, v.sell_when)}\n${v.name} · ${v.mobile} · ${v.email}\n${v.photos.length} photos · signed ${signature ? "with a drawn signature" : "with their typed name"}` },
    { channel: "sms", to_addr: v.mobile, kind: "account", title: `Thanks ${v.name.split(" ")[0]}, we've got your ${[v.year, v.make, v.model].filter(Boolean).join(" ")} (ref ${row.ref}). We'll call you within 1 business day`, body: "", priority: 3, dedupe_key: `sell-sms:${row.ref}` },
  ]);
  kickOutbox();
  const subject = `Your Tyrebiter sell form ${row.ref}: a copy of what you signed`;
  const text = `Hi ${v.name.split(" ")[0]},\n\nThanks for choosing Tyrebiter to sell your ${facts[0][1]}. Your reference is ${row.ref}.\n\nWhat happens next:\n1. We call you within 1 business day to talk through the price guide and your ${v.reserve_type === "reserve" ? "reserve" : "no-reserve sale"}.\n2. We text you a link to verify your identity (about 2 minutes in your browser), add the bank account we pay you into and a photo of the registration papers, and confirm the agreement.\n3. We check the vehicle and photograph it at your place, then it goes live for 7 days.\n\nA copy of the Seller Agency Agreement you signed is attached. Questions? Call ${env.phone}.`;
  after(async () => {
    await sendEmail({
      to: v.email, subject, text, html: mailHtml(subject, text, `${env.siteUrl}/sell`, "About selling with Tyrebiter"),
      attachments: pdf ? [{ filename: `Tyrebiter-seller-agreement-${row.ref}.pdf`, content: Buffer.from(pdf).toString("base64") }] : undefined,
    }).catch(() => null);
  });
  return json({ ref: row.ref, emailed: !!pdf });
}
