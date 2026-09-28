import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail, friendly } from "@/lib/api";
import { allow, clientIp, userAgent } from "@/lib/ratelimit";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

const yn = (v: unknown) => (v === "yes" ? "yes" : v === "no" ? "no" : "");
const txt = (v: unknown, n = 500) => String(v ?? "").trim().slice(0, n);

// The seller e-signs the Seller Agency Agreement with their disclosures and payout details.
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
  const reserve = b.reserve ? Math.round(Number(String(b.reserve).replace(/[^0-9]/g, ""))) : null;
  const d = b.disclosures || {};
  const disclosures = {
    finance: yn(d.finance), finance_amount: d.finance === "yes" ? String(Math.round(Number(String(d.finance_amount || "0").replace(/[^0-9.]/g, "")))) : "",
    lender_name: d.finance === "yes" ? txt(d.lender_name, 120) : "", lender_ref: d.finance === "yes" ? txt(d.lender_ref, 60) : "",
    write_off: ["none", "repairable", "statutory"].includes(d.write_off) ? d.write_off : "none",
    accident: d.accident === "yes" ? `Yes: ${txt(d.accident_details)}` : yn(d.accident),
    flood: d.flood === "yes" ? `Yes: ${txt(d.flood_details)}` : yn(d.flood),
    hail: d.hail === "yes" ? `Yes: ${txt(d.hail_details)}` : yn(d.hail),
    modifications: d.modifications === "yes" ? `Yes: ${txt(d.modifications_details)}` : yn(d.modifications),
    warning_lights: d.warning_lights === "yes" ? `Yes: ${txt(d.warning_lights_details)}` : yn(d.warning_lights),
    odometer_concerns: d.odometer_concerns === "yes" ? `Yes: ${txt(d.odometer_details)}` : yn(d.odometer_concerns),
    known_faults: txt(d.known_faults, 1000), keys: String(Math.max(0, Math.min(9, Number(d.keys) || 0))), service_books: d.service_books === "yes",
    rego_expiry: txt(d.rego_expiry, 20),
  };
  if (["finance", "accident", "flood", "hail", "modifications", "warning_lights", "odometer_concerns"].some((k) => !String((disclosures as Record<string, unknown>)[k]))) {
    return fail("Answer every yes/no question about the vehicle.");
  }
  const docs = (Array.isArray(b.docs) ? b.docs : []).filter((p: unknown) => typeof p === "string" && p.startsWith(`${user.id}/`)).slice(0, 10);
  if (!docs.length) return fail("Upload a photo of the registration papers (or proof of ownership).");
  const bsb = String(b.bank?.bsb || "").replace(/[^0-9]/g, ""), acct = String(b.bank?.account || "").replace(/[^0-9]/g, "");
  if (!/^\d{6}$/.test(bsb) || !/^\d{5,10}$/.test(acct) || !txt(b.bank?.name)) return fail("Check your bank details (account name, 6-digit BSB, account number).");

  const admin = supabaseAdmin();
  const { data: agreementId, error } = await admin.rpc("sign_seller_agreement", {
    p_user: user.id, p_invite: String(b.invite || ""), p_name: name, p_reserve: reserve, p_disclosures: disclosures,
    p_gst: !!b.gst, p_abn: b.gst ? txt(b.abn, 20) : null, p_owner_type: ["individual", "joint", "company", "trust"].includes(b.ownerType) ? b.ownerType : "individual",
    p_docs: docs, p_ip: await clientIp(), p_ua: await userAgent(),
  });
  if (error) return fail(friendly(error.message));
  await admin.from("seller_bank").upsert({ seller_id: user.id, account_name: txt(b.bank.name, 120), bsb: `${bsb.slice(0, 3)}-${bsb.slice(3)}`, account_number: acct, confirmed_at: null, updated_at: new Date().toISOString() });
  await sendEmail({ to: env.supportEmail, subject: `Seller signed: ${b.invite}`, text: `Agreement ${agreementId}. Check ownership papers and confirm bank details by phone in admin: ${env.siteUrl}/admin/lots` }).catch(() => undefined);
  return json({ ok: true });
}
