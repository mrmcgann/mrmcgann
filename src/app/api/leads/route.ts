import { allow } from "@/lib/ratelimit";
import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getPartnersCached } from "@/lib/cache";
import { consentText, isPostcode, KIND_NOUN } from "@/lib/partners";
import { kickOutbox } from "@/lib/notify";
import { json, fail } from "@/lib/api";
import { money } from "@/lib/format";
import { env } from "@/lib/env";
import type { PartnerKind } from "@/lib/types";

const KINDS: PartnerKind[] = ["finance", "insurance", "inspection", "transport", "warranty"];
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
// What each kind of enquiry may carry to the partner (the consent text lists the same things).
const FIELDS: Record<PartnerKind, string[]> = {
  finance: ["amount", "deposit", "term_months", "balloon", "frequency"],
  insurance: ["cover", "vehicle"],
  inspection: ["notes"],
  transport: ["notes"],
  warranty: ["vehicle", "odometer", "notes"],
};

// A member asks a partner (lender, insurer, mobile inspector) to contact them. Only signed-in
// members with a verified mobile can do this, and their verified name, mobile and email are
// what's sent, so nobody can pass on someone else's details. Mobile inspections also need a
// fully verified account (they send a mechanic to the seller's address). We record the exact
// consent wording, queue an email to the partner and confirm to the member.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const kind = b.kind as PartnerKind;
  if (!KINDS.includes(kind)) return fail("Choose what you'd like help with.");
  if (b.consent !== true) return fail("Tick the box so we can pass your details on.");

  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const admin = supabaseAdmin();
  const { data: p } = await admin.from("profiles").select("first_name, last_name, email, mobile, mobile_verified, postcode, suspended").eq("id", user.id).maybeSingle();
  if (!p || p.suspended) return fail("Your account can't do that. Please call us.", 403);
  if (!p.mobile_verified || !p.mobile) return fail("Verify your mobile first, so the partner can reach you.", 403);
  if (kind === "inspection") {
    const { data: canBid } = await admin.rpc("can_bid", { p_user: user.id });
    if (!canBid) return fail("Finish verifying your account (mobile, card and ID) before ordering an inspection.", 403);
  }
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  if (name.length < 2) return fail("Add your name in your account first.");
  const email = String(p.email || user.email || "").toLowerCase();
  const phone = p.mobile as string;
  const postcode = clip(b.postcode || p.postcode, 4);
  if (postcode && !isPostcode(postcode)) return fail("Enter a 4-digit postcode.");
  if (kind === "insurance" && !postcode) return fail("Enter your postcode. Insurers need it to quote.");
  if (kind === "transport" && !postcode) return fail("Enter the postcode you want it delivered to.");

  const partner = (await getPartnersCached()).find((x) => x.id === b.partnerId && x.kind === kind);
  if (!partner || !partner.accepts_leads) return fail("That partner isn't taking enquiries right now.");
  if (!(await allow(`lead:${user.id}`, 10, 86400)) || !(await allow("lead:all", 5000, 86400))) return fail("Too many requests today. Please call us.", 429);

  let lot: { id: number; title: string; suburb: string | null; state: string | null; status: string } | null = null;
  if (b.lotId) {
    const { data } = await admin.from("lots").select("id, title, suburb, state, status").eq("id", Number(b.lotId)).neq("status", "draft").maybeSingle();
    lot = data;
  }
  if (kind === "transport" && !lot) return fail("Choose the vehicle to move.");
  if (kind === "inspection") {
    if (!lot || !["live", "scheduled"].includes(lot.status)) return fail("Inspections can only be ordered while the vehicle is listed.");
    const { count } = await admin.from("partner_leads").select("id", { count: "exact", head: true }).eq("kind", "inspection").eq("lot_id", lot.id).in("status", ["new", "sent", "contacted", "booked"]);
    if ((count || 0) >= 5) return fail("Several inspections are already booked for this vehicle. Ask your consultant for a copy of the report.");
  }

  // One open enquiry per member per partner (per vehicle) a day: a second click shouldn't spam the partner.
  const since = new Date(Date.now() - 86400000).toISOString();
  let dupQ = admin.from("partner_leads").select("ref").eq("partner_id", partner.id).eq("user_id", user.id).gte("created_at", since).limit(1);
  dupQ = lot ? dupQ.eq("lot_id", lot.id) : dupQ.is("lot_id", null);
  const { data: dup } = await dupQ.maybeSingle();
  if (dup) return json({ ok: true, ref: dup.ref, repeat: true });

  const d = (b.details && typeof b.details === "object" ? b.details : {}) as Record<string, unknown>;
  const details: Record<string, string | number> = {};
  for (const k of FIELDS[kind]) {
    if (d[k] == null || d[k] === "") continue;
    details[k] = typeof d[k] === "number" && Number.isFinite(d[k]) ? (d[k] as number) : clip(d[k], k === "notes" ? 500 : 80);
  }
  if (kind === "transport" && lot) details.collect_from = `${lot.suburb}, ${lot.state}`;
  if (kind === "warranty" && lot) {
    const { data: odo } = await admin.from("lots").select("odometer").eq("id", lot.id).maybeSingle();
    if (odo?.odometer != null) details.odometer = `${Number(odo.odometer).toLocaleString("en-AU")} km`;
  }
  if (lot) details.vehicle = `${lot.title} (lot ${lot.id})`;
  const consent = consentText(partner, !!details.vehicle);

  const { data: lead, error } = await admin.from("partner_leads").insert({
    partner_id: partner.id, kind, lot_id: lot?.id ?? null, user_id: user.id, name, email, phone, postcode: postcode || null,
    details, consent_text: consent, price: kind === "inspection" ? partner.price_from : null,
  }).select("id, ref").single();
  if (error || !lead) return fail("Couldn't send that. Please try again or call us.", 500);

  // To the partner (queued and retried by the outbox sender), a copy to the member, and for
  // inspections a note to our team (they give the inspector the address and seller's contact).
  const { data: priv } = await admin.from("partner_private").select("lead_email").eq("partner_id", partner.id).maybeSingle();
  const lines = [
    `Reference: ${lead.ref}`, `Name: ${name}`, `Mobile: ${phone}`, `Email: ${email}`, postcode ? `${kind === "transport" ? "Deliver to postcode" : "Postcode"}: ${postcode}` : "",
    ...Object.entries(details).map(([k, v]) => `${k.replace(/_/g, " ")}: ${["amount", "deposit", "balloon"].includes(k) ? money(Number(v)) : v}`),
    kind === "inspection" && lot ? `Vehicle location: ${lot.suburb}, ${lot.state} (Tyrebiter will send the address and the seller's contact details)` : "",
    "", `They agreed to: "${consent}"`, `Please contact them within 10 business days and quote ${lead.ref}.`,
  ].filter((l) => l !== "");
  const rows: Record<string, unknown>[] = [{
    channel: "email", to_addr: priv?.lead_email || env.supportEmail, kind: "lead", title: `New Tyrebiter enquiry ${lead.ref}: ${KIND_NOUN[kind]}`,
    body: lines.join("\n"), link: null, dedupe_key: `lead:${lead.id}:partner`, priority: 2,
  }, {
    user_id: user.id, channel: "email", to_addr: email, kind: "account", title: `We've passed your details to ${partner.name}`,
    body: `Thanks ${name.split(" ")[0]}. ${partner.name} will contact you about ${KIND_NOUN[kind]}${lot ? ` (${lot.title})` : ""}. Your reference is ${lead.ref}. If you change your mind, reply to this email and we'll let them know.`,
    link: lot ? `/lot/${lot.id}` : null, dedupe_key: `lead:${lead.id}:person`, priority: 3,
  }];
  if (kind === "inspection") rows.push({
    channel: "email", to_addr: env.supportEmail, kind: "lead", title: `Mobile inspection ordered ${lead.ref}: ${lot?.title}`,
    body: `${lines.join("\n")}\n\nSend the inspector the vehicle's address and the seller's contact details, and call the seller to let them know.`,
    link: "/admin/leads?kind=inspection", dedupe_key: `lead:${lead.id}:staff`, priority: 2,
  });
  const sent = await admin.from("outbox").insert(rows);
  if (!sent.error) await admin.from("partner_leads").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", lead.id);
  kickOutbox();
  return json({ ok: true, ref: lead.ref });
}
