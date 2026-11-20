import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail, friendly } from "@/lib/api";
import { allow, clientIp, userAgent } from "@/lib/ratelimit";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { SELLER_ACKS, cleanDisclosures, cleanSignature, signatureSvg } from "@/lib/sellForm";
import { appointmentBase } from "@/lib/appointmentServer";
import { appointmentProblem, buildAppointment, type Appointment } from "@/lib/appointment";
import { getSettingsCached } from "@/lib/cache";
import { SELLER_AGREEMENT, fillLegal } from "@/content/legal";

const txt = (v: unknown, n = 500) => String(v ?? "").trim().slice(0, n);

// The seller e-signs their appointment of us on Queensland's approved form (Form 9), with the Seller Agency Agreement
// as its Annexure A, their disclosures and payout details. We store exactly what they signed (seller_agreements.appointment);
// staff countersign it and email them the signed copy before the truck can be listed (migration 39).
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  if (!(await allow(`sign:${user.id}`, 10, 3600))) return fail("Too many attempts. Call us.", 429);
  const { data: me } = await db.rpc("me");
  if (!me?.details_done || !me?.mobile_verified) return fail("Add your details and verify your mobile first.");
  if (me.id_status !== "verified") return fail("Verify your ID first. It takes about two minutes.");
  if (!b.agree || !b.owner) return fail("Tick both boxes to confirm.");
  const name = txt(b.signedName, 120);
  if (name.toLowerCase().replace(/\s+/g, " ") !== `${me.first_name} ${me.last_name}`.toLowerCase().replace(/\s+/g, " ")) {
    return fail(`Type your full legal name exactly as verified: ${me.first_name} ${me.last_name}.`);
  }
  const money = (v: unknown) => { const n = parseFloat(String(v ?? "").replace(/[^0-9.]/g, "")); return Number.isFinite(n) ? Math.round(n) : null; };
  const reserve = String(b.reserve ?? "").trim() ? money(b.reserve) : null;
  if (String(b.reserve ?? "").trim() && (reserve == null || reserve <= 0 || reserve > 5_000_000)) return fail("Check the reserve amount.");
  const { value: disclosures, error: discError } = cleanDisclosures(b.disclosures || {}, { business: b.ownerType === "company" || !!b.gst });
  if (discError) return fail(discError);
  // the drawn signature (or, for someone who can't draw one, the typed name alone)
  const signature = cleanSignature(b.signature);
  if (!signature && !b.noDraw) return fail("Sign in the box (with your finger, a pen or the mouse).");
  const docs = (Array.isArray(b.docs) ? b.docs : []).filter((p: unknown) => typeof p === "string" && p.startsWith(`${user.id}/`)).slice(0, 10);
  if (!docs.length) return fail("Upload a photo of the registration papers (or proof of ownership).");
  const bsb = String(b.bank?.bsb || "").replace(/[^0-9]/g, ""), acct = String(b.bank?.account || "").replace(/[^0-9]/g, "");
  if (!/^\d{6}$/.test(bsb) || !/^\d{5,10}$/.test(acct) || !txt(b.bank?.name)) return fail("Check your bank details (account name, 6-digit BSB, account number).");
  // where it's kept (viewings and the handover happen there), and what the seller agrees to about them
  const pickup = txt(b.pickupAddress, 200);
  if (pickup.length < 8) return fail("Add the address where the truck is kept.");
  const acks = SELLER_ACKS.map(([k]) => k).filter((k) => Array.isArray(b.acknowledgements) && b.acknowledgements.includes(k));
  if (acks.length < SELLER_ACKS.length) return fail("Tick each box about viewings, the handover and selling through us to agree to them.");

  const admin = supabaseAdmin();
  const ownerType = ["individual", "joint", "company", "trust"].includes(b.ownerType) ? String(b.ownerType) : "individual";
  // The appointment form needs our licence and the seller's details: check before anything is signed.
  const { data: inv } = await admin.from("lot_private").select("lot_id").eq("seller_invite", String(b.invite || "")).maybeSingle();
  const base = inv?.lot_id ? await appointmentBase(admin, inv.lot_id, user.id, { ownerType }) : null;
  if (!base) return fail("This link isn't valid or has expired. Call us and we'll send a new one.");
  const problem = appointmentProblem(base);
  if (problem) return fail(problem);
  if (ownerType === "company" && !base.client.company) return fail("It's owned by a company: add the company's name and ABN on your account page first, so your appointment names it.");

  const { data: agreementId, error } = await admin.rpc("sign_seller_agreement", {
    p_user: user.id, p_invite: String(b.invite || ""), p_name: name, p_reserve: reserve, p_disclosures: disclosures,
    p_gst: !!b.gst, p_abn: b.gst ? txt(b.abn, 20) : null, p_owner_type: ownerType,
    p_docs: docs, p_ip: await clientIp(), p_ua: await userAgent(),
  });
  if (error) return fail(friendly(error.message));
  // The pickup details, the seller's promises, the optional inspection before listing (its fee is locked into the
  // agreement), and the appointment exactly as signed: Form 9 filled in with the fees locked by the agreement, Annexure A
  // as they read it, and their signature.
  const { data: ag } = await admin.from("seller_agreements").select("lot_id, fees").eq("id", agreementId as string).maybeSingle();
  if (ag?.lot_id) {
    const settings = await getSettingsCached();
    const fee = b.preInspection === true ? Math.max(0, Number((settings.selling as { pre_inspection_fee?: number } | undefined)?.pre_inspection_fee || 0)) : 0;
    const locked = { ...((ag.fees as Record<string, unknown>) || {}), pre_inspection_fee: fee };
    const signed = (await appointmentBase(admin, ag.lot_id, user.id, { ownerType, lockedFees: locked })) || base;
    const appointment: Appointment = {
      ...buildAppointment({ ...signed, reserve, assignOk: b.assignOk === true, fees: { ...signed.fees, preInspection: fee } }),
      annexure: fillLegal(SELLER_AGREEMENT, settings), signature: signature || null,
    };
    await Promise.all([
      admin.from("seller_agreements").update({ fees: locked, acknowledgements: acks, appointment, assign_ok: b.assignOk === true }).eq("id", agreementId as string),
      admin.from("lot_private").upsert({ lot_id: ag.lot_id, pre_inspection_requested: b.preInspection === true, seller_address: pickup, pickup_notes: txt(b.pickupNotes, 300) || null }),
    ]);
  }
  if (signature) {
    const path = `${user.id}/${String(b.invite || "").replace(/[^0-9a-f]/g, "")}/signature-${Date.now()}.svg`;
    const up = await admin.storage.from("seller-docs").upload(path, new TextEncoder().encode(signatureSvg(signature)), { contentType: "image/svg+xml", upsert: true });
    if (!up.error) await admin.from("seller_agreements").update({ signature_path: path }).eq("id", agreementId as string);
  }
  await admin.from("seller_bank").upsert({ seller_id: user.id, account_name: txt(b.bank.name, 120), bsb: `${bsb.slice(0, 3)}-${bsb.slice(3)}`, account_number: acct, confirmed_at: null, updated_at: new Date().toISOString() });
  await sendEmail({ to: env.supportEmail, subject: `Seller signed: ${b.invite}`, text: `Agreement ${agreementId}. Countersign the seller's appointment (Form 9) on the vehicle's admin page: that emails them their signed copy. Check the ownership papers and confirm the bank details by phone: ${env.siteUrl}/admin/lots${ag?.lot_id ? `/${ag.lot_id}` : ""}${b.preInspection === true ? "\n\nThe seller wants an inspection before listing: book the mechanic." : ""}\nPickup address: ${pickup}` }).catch(() => undefined);
  return json({ ok: true });
}
