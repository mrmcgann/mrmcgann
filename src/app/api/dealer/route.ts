import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail } from "@/lib/api";
import { allow } from "@/lib/ratelimit";
import { cleanAbn, formatAbn, isAbn } from "@/lib/abn";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

// Apply for a dealer account: business name and ABN (checked against the ABN's own check digits, and against the
// Australian Business Register when ABR_GUID is set), GST status and dealer licence. Our team approves it.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  if (!(await allow(`dealer:${user.id}`, 6, 86400))) return fail("Too many applications today. Call us.", 429);
  const { data: me } = await db.rpc("me");
  if (!me?.details_done || !me?.mobile_verified || me?.id_status !== "verified") return fail("Finish setting up your account first (your details, mobile and ID).");
  const company = String(b.company || "").trim().replace(/\s+/g, " ").slice(0, 120);
  const abn = cleanAbn(b.abn);
  const licence = String(b.licence || "").trim().slice(0, 60) || null;
  if (company.length < 2) return fail("Enter your business name as it's registered.");
  if (!isAbn(abn)) return fail("That ABN doesn't look right. Check the 11 digits against the ABN Lookup site.");
  let abr = "";
  if (process.env.ABR_GUID) {
    try {
      const r = await fetch(`https://abr.business.gov.au/json/AbnDetails.aspx?abn=${abn}&guid=${encodeURIComponent(process.env.ABR_GUID)}`, { signal: AbortSignal.timeout(6000) });
      const text = await r.text();
      const d = JSON.parse(text.replace(/^[^(]*\(/, "").replace(/\)\s*;?\s*$/, "")) as { AbnStatus?: string; EntityName?: string; Gst?: string | null; Message?: string };
      if (d.Message) return fail("The Australian Business Register doesn't know that ABN. Check it and try again.");
      if (d.AbnStatus !== "Active") return fail("That ABN isn't active on the Australian Business Register.");
      abr = `ABR: active, ${d.EntityName || "no entity name"}${d.Gst ? `, GST from ${d.Gst}` : ", not registered for GST"}`;
    } catch { abr = "ABR: couldn't check (try ABN Lookup)"; }
  }
  const admin = supabaseAdmin();
  const { data: cur } = await admin.from("profiles").select("dealer_status").eq("id", user.id).single();
  if (cur?.dealer_status === "pending") return fail("Your application is with our team. We'll be in touch within one business day.");
  const { error } = await admin.from("profiles").update({
    company_name: company, abn, gst_registered: b.gst === true, dealer_licence: licence,
    dealer_status: "pending", dealer_applied_at: new Date().toISOString(), dealer_note: abr || null,
  }).eq("id", user.id);
  if (error) return fail("Couldn't send your application. Please try again.");
  await sendEmail({ to: env.supportEmail, subject: `Dealer application: ${company}`, text: `${company}, ABN ${formatAbn(abn)}${licence ? `, licence ${licence}` : ""}. ${abr}\nCheck it on abr.business.gov.au and approve in admin: ${env.siteUrl}/admin/dealers` }).catch(() => undefined);
  return json({ ok: true });
}
