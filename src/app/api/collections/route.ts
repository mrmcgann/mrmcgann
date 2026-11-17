import { currentUser } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { json, fail, friendly } from "@/lib/api";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

// Buyer books a time to collect. Most trucks are collected from where they're kept (lots.collect_from 'seller'): we
// agree the time with the seller, then the buyer gets the address and their release code. Older listings are
// collected from our depot once our transport partner has taken them there. The database checks it again
// (collection_needs_depot, collection_needs_transfer), so this only gives a friendlier answer first.
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const db = await supabaseServer();
  const user = await currentUser(db);
  if (!user) return fail("Sign in first.", 401);
  const { data: inv } = await db.from("invoices").select("id, lot_id, status, ref, lots(collect_from)").eq("id", b.invoiceId).eq("buyer_id", user.id).maybeSingle();
  if (!inv) return fail("Invoice not found.", 404);
  if (inv.status !== "paid") return fail("You can book collection once the invoice is paid in full.");
  // The seller's notice of disposal comes first (or there's nothing to lodge, when it's sold unregistered). The
  // buyer's own transfer never holds up a booking (migration 32).
  const { data: clear } = await db.rpc("transfer_clear", { p_invoice: inv.id });
  if (!clear) return fail("We're lodging the seller's notice of disposal first. We'll text you as soon as you can book a time.");
  const atSeller = ((inv as unknown as { lots: { collect_from?: string } | null }).lots?.collect_from || "seller") !== "depot";
  if (!atSeller) {
    const { data: tr } = await db.rpc("invoice_transport", { p_invoice: inv.id });
    const job = ((tr || []) as { status: string; condition_ok: boolean | null; buyer_decision: string | null }[])[0];
    if (!job || job.status !== "at_depot") return fail("It isn't at our depot yet. We'll tell you as soon as it arrives, so you can book a time.");
    if (job.condition_ok === false && job.buyer_decision !== "proceed") return fail("First tell us whether you're going ahead after the change our driver noted (above).");
  }
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
  if (error) return fail(/not_at_depot|change_not_answered|transfer_not_done/.test(error.message) ? friendly(error.message) : "Couldn't save your booking.");
  if (collector) await admin.from("invoices").update({ collector_name: collector, collector_mobile: mobile }).eq("id", inv.id);
  await sendEmail({ to: env.supportEmail, subject: `Collection request ${inv.ref}: ${day}, ${time}`, text: `Check the time with the ${atSeller ? "seller" : "depot"}, then confirm it in admin: ${env.siteUrl}/admin/collections` }).catch(() => undefined);
  return json({ ok: true });
}
