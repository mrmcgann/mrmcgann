import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail, friendly } from "@/lib/api";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

// Buyer books a time to collect from our depot (once it's paid for, at the depot and in their name). We confirm it with
// the depot; the buyer then gets the depot's address and their release code.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const { data: inv } = await db.from("invoices").select("id, lot_id, status, ref").eq("id", b.invoiceId).eq("buyer_id", user.id).maybeSingle();
  if (!inv) return fail("Invoice not found.", 404);
  if (inv.status !== "paid") return fail("You can book collection once the invoice is paid in full.");
  const { data: t } = await db.from("ownership_transfers").select("status").eq("invoice_id", inv.id).maybeSingle();
  if (t?.status !== "complete") return fail("Finish the transfer of ownership first. Your invoice shows the steps.");
  const { data: tr } = await db.rpc("invoice_transport", { p_invoice: inv.id });
  const job = ((tr || []) as { status: string; condition_ok: boolean | null; buyer_decision: string | null }[])[0];
  if (!job || job.status !== "at_depot") return fail("It isn't at our depot yet. We'll tell you as soon as it arrives, so you can book a time.");
  if (job.condition_ok === false && job.buyer_decision !== "proceed") return fail("First tell us whether you're going ahead after the change our driver noted (above).");
  const day = String(b.day || "").slice(0, 60), time = String(b.time || "").slice(0, 60);
  if (!day || !time) return fail("Pick a day and a time.");
  const collector = String(b.collectorName || "").trim().slice(0, 120) || null;
  const mobile = String(b.collectorMobile || "").replace(/[^0-9+ ]/g, "").slice(0, 20) || null;
  if (collector && !mobile) return fail("Add your collector's mobile so we can text them the release code.");
  const admin = supabaseAdmin();
  const { data: existing } = await admin.from("collections").select("id, status").eq("invoice_id", inv.id).maybeSingle();
  if (existing && existing.status !== "requested") return fail("Your collection is already confirmed. Call us to change it.");
  const row = { invoice_id: inv.id, lot_id: inv.lot_id, buyer_id: user.id, preferred_day: day, preferred_time: time,
    collector_name: collector, collector_mobile: mobile, carrier_ref: String(b.carrierRef || "").slice(0, 80) || null };
  const { error } = existing ? await admin.from("collections").update(row).eq("id", existing.id) : await admin.from("collections").insert(row);
  if (error) return fail(error.message.includes("not_at_depot") || error.message.includes("change_not_answered") ? friendly(error.message) : "Couldn't save your booking.");
  if (collector) await admin.from("invoices").update({ collector_name: collector, collector_mobile: mobile }).eq("id", inv.id);
  await sendEmail({ to: env.supportEmail, subject: `Collection request ${inv.ref}: ${day}, ${time}`, text: `Check the time with the depot, then confirm it in admin: ${env.siteUrl}/admin/collections` }).catch(() => undefined);
  return json({ ok: true });
}
