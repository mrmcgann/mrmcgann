import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { SELLER_AGREEMENT_VERSION_LABEL } from "@/content/legal";
import { DEFAULT_FEES } from "@/lib/types";
import { kindLabel } from "@/lib/vehicles";
import { NOTICE_DAYS, brisbaneToday, longDate, type AppointmentInput } from "@/lib/appointment";
import { appointmentPdf } from "@/lib/pdf";
import { sendEmail, mailHtml } from "@/lib/email";
import { friendly } from "@/lib/api";

type Obj = Record<string, unknown>;
const num = (v: unknown, d = 0) => (Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : d);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/** Our side of the appointment (Part 2): the company, its Queensland motor dealer licence, and how to reach us. */
export function licenseeDetails(business: Obj | undefined): AppointmentInput["licensee"] {
  const expiry = str(business?.qld_licence_expiry);
  return {
    agency: "Super Trucker",
    name: env.legalName,
    licenceNo: str(business?.qld_licence_no),
    licenceExpiry: /^\d{4}-\d{2}-\d{2}$/.test(expiry) ? longDate(expiry) : expiry,
    address: env.address,
    phone: env.phone,
    email: env.supportEmail,
  };
}

/**
 * Everything Form 9 needs except what the seller chooses on the form (reserve, assignment, the inspection before
 * listing): the seller from their verified profile, the truck from the listing, us from the settings, the fees as they
 * stand (or as locked into the signed agreement). The agreement page previews with it; the signing route stores it.
 */
export async function appointmentBase(admin: SupabaseClient, lotId: number, userId: string, opts: { ownerType?: string; lockedFees?: Obj | null } = {}): Promise<AppointmentInput | null> {
  const [{ data: p }, { data: lot }, { data: rows }] = await Promise.all([
    admin.from("profiles").select("first_name, last_name, street, suburb, state, postcode, mobile, email, company_name, abn").eq("id", userId).maybeSingle(),
    admin.from("lots").select("make, model, year, vin, engine_no, rego_plate, registration, category, kind, odometer, colour, title").eq("id", lotId).maybeSingle(),
    admin.from("settings").select("key, value").in("key", ["fees", "selling", "auction", "business"]),
  ]);
  if (!p || !lot) return null;
  const s = Object.fromEntries((rows || []).map((r: { key: string; value: unknown }) => [r.key, (r.value || {}) as Obj])) as Record<string, Obj | undefined>;
  const fees = { ...DEFAULT_FEES, ...(s.fees || {}) } as unknown as Obj;
  const locked = opts.lockedFees || {};
  const company = opts.ownerType === "company" ? str(p.company_name) : "";
  return {
    client: {
      name: `${str(p.first_name)} ${str(p.last_name)}`.trim(),
      company: company || null,
      abn: company ? str(p.abn) || null : null,
      address: [str(p.street), [str(p.suburb), str(p.state), str(p.postcode)].filter(Boolean).join(" ")].filter(Boolean).join(", "),
      phone: str(p.mobile) || null,
      email: str(p.email) || null,
      joint: opts.ownerType === "joint",
    },
    licensee: licenseeDetails(s.business),
    vehicle: {
      makeModel: [str(lot.make), str(lot.model)].filter(Boolean).join(" ") || str(lot.title),
      built: lot.year ?? null,
      vin: str(lot.vin) || null,
      engineNo: str(lot.engine_no) || null,
      rego: lot.registration === "unregistered" ? null : str(lot.rego_plate) || null,
      type: kindLabel(lot.category, lot.kind) || null,
      odometer: lot.odometer ?? null,
      colour: str(lot.colour) || null,
    },
    reserve: null,
    startOn: brisbaneToday(),
    fees: {
      sellerRate: num(locked.seller_fee_rate ?? fees.seller_fee_rate),
      sellerMin: num(locked.seller_fee_min ?? fees.seller_fee_min),
      withdrawal: num(locked.withdrawal_fee ?? fees.withdrawal_fee),
      preInspection: 0,
      premiumRate: num(fees.premium_rate, 0.06),
      premiumMin: num(fees.premium_min),
      adminFee: num(fees.admin_fee),
      exclusivityDays: num(s.auction?.exclusivity_days, 90),
    },
    assignOk: false,
    agreementVersion: SELLER_AGREEMENT_VERSION_LABEL,
  };
}

/**
 * Email the seller their signed copy of the appointment (the PDF, attached) and record that they have it: the copy must
 * be given to the client straight after both have signed (MDCA Act s 84), and the publish check waits for it.
 */
export async function sendAppointmentCopy(admin: SupabaseClient, agreementId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: ag } = await admin.from("seller_agreements").select("id, lot_id, seller_id, countersigned_at, ends_at").eq("id", agreementId).maybeSingle();
  if (!ag) return { ok: false, error: "That agreement wasn't found." };
  if (!ag.countersigned_at) return { ok: false, error: "Countersign it first." };
  const [{ data: p }, { data: lot }, pdf] = await Promise.all([
    admin.from("profiles").select("first_name, email").eq("id", ag.seller_id).maybeSingle(),
    admin.from("lots").select("title").eq("id", ag.lot_id).maybeSingle(),
    appointmentPdf(agreementId),
  ]);
  if (!p?.email) return { ok: false, error: "The seller has no email address on file. Add it to their account, then send the copy." };
  if (!pdf) return { ok: false, error: "This agreement has no appointment form to send. Ask the seller to sign again from their agreement link." };
  const ends = ag.ends_at ? new Date(ag.ends_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "Australia/Brisbane" }) : "";
  const subject = "Your signed appointment of Super Trucker";
  const text = `Hi ${str(p.first_name) || "there"},\n\nWe've countersigned your appointment of Super Trucker to sell your ${str(lot?.title) || "truck"} (Queensland's approved form, Form 9, with the Seller Agency Agreement attached as Annexure A). Your signed copy is attached: please keep it.\n\n${ends ? `It runs until ${ends}. ` : ""}Either of us can end it by giving the other at least ${NOTICE_DAYS} days' written notice: you can do that from your seller dashboard. Questions? Call ${env.phone}.`;
  const r = await sendEmail({
    to: p.email, subject, text, html: mailHtml(subject, text, `${env.siteUrl}/sell/dashboard`, "Your seller dashboard"),
    attachments: [{ filename: pdf.filename, content: Buffer.from(pdf.bytes).toString("base64") }],
  }).catch((e: unknown) => ({ ok: false, status: 0, error: e instanceof Error ? e.message : "email failed" }));
  if (!r.ok) return { ok: false, error: `the email didn't send${r.error ? `: ${r.error}` : ""}` };
  const { error } = await admin.rpc("appointment_copy_sent", { p_agreement: agreementId });
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true };
}
